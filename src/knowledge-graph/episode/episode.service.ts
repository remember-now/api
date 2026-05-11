import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { LlmService } from '@/llm/llm.service';

import { LLM_CONCURRENCY_LIMIT, withConcurrency } from '../bulk/bulk-utils';
import { chunkContent, shouldChunk } from '../bulk/content-chunking';
import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import {
  CombinedExtractionService,
  EdgeExtractionService,
  NodeExtractionService,
} from '../extraction';
import {
  createEpisodicEdge,
  createEpisodicNode,
  createHasEpisodeEdge,
  createNextEpisodeEdge,
  createSagaNode,
  EntityEdge,
  EntityNode,
  EpisodeType,
  EpisodicNode,
} from '../models';
import {
  GroupId,
  NodeNameSchema,
  RetrieveEpisodesParamsSchema,
  SearchBySimilarityParamsSchema,
  SearchByTextParamsSchema,
  Uuid,
} from '../neo4j';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  NextEpisodeEdgeRepository,
  SagaNodeRepository,
} from '../neo4j/repositories';
import {
  buildExtractEdgeAttributesMessages,
  buildExtractEntityAttributesMessages,
} from '../prompts';
import { buildNodeSummaryMessages } from '../prompts/node-summary.prompts';
import {
  buildSummarizeSagaMessages,
  sagaSummaryJsonSchema,
} from '../prompts/summarize-sagas.prompts';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import {
  CANDIDATE_LIMIT,
  MAX_NODES_PER_SUMMARY_BATCH,
  PREVIOUS_EPISODES_WINDOW,
} from './episode-constants';
import { getApplicableEdgeTypes, getEffectiveTypeMappings } from './episode-utils';
import {
  AddEpisodeOptions,
  AddEpisodeOptionsInput,
  AddEpisodeOptionsSchema,
  AddEpisodeResult,
  EdgeTypeMap,
  EdgeTypeMappings,
  EntityTypeMap,
  nodeSummaryJsonSchema,
} from './episode.types';

@Injectable()
export class EpisodeService {
  constructor(
    private readonly llmService: LlmService,
    private readonly communityService: CommunityService,
    private readonly embeddingService: EmbeddingService,
    private readonly nodeExtractionService: NodeExtractionService,
    private readonly edgeExtractionService: EdgeExtractionService,
    private readonly nodeResolutionService: NodeResolutionService,
    private readonly edgeResolutionService: EdgeResolutionService,
    private readonly combinedExtractionService: CombinedExtractionService,
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly entityEdgeRepository: EntityEdgeRepository,
    private readonly episodicNodeRepository: EpisodicNodeRepository,
    private readonly episodicEdgeRepository: EpisodicEdgeRepository,
    private readonly sagaNodeRepository: SagaNodeRepository,
    private readonly hasEpisodeEdgeRepository: HasEpisodeEdgeRepository,
    private readonly nextEpisodeEdgeRepository: NextEpisodeEdgeRepository,
  ) {}

  async getEpisodes(options: {
    groupIds: GroupId[];
    referenceTime?: Date;
    lastN?: number;
    source?: EpisodeType;
    sagaUuid?: Uuid;
  }): Promise<EpisodicNode[]> {
    const {
      groupIds,
      referenceTime = new Date(),
      lastN = 10,
      source,
      sagaUuid,
    } = options;
    return this.episodicNodeRepository.retrieveEpisodes(
      RetrieveEpisodesParamsSchema.parse({
        referenceTime,
        lastN,
        groupIds,
        source,
        sagaUuid,
      }),
    );
  }

  async deleteEpisode(uuid: Uuid): Promise<void> {
    const episode = await this.episodicNodeRepository.getByUuid(uuid);
    if (!episode) return;

    // Load entity nodes mentioned by this episode
    const mentionedNodeUuids =
      await this.episodicNodeRepository.getMentionedEntityUuids(uuid);

    // Delete entity nodes that are only mentioned by this episode
    await Promise.all(
      mentionedNodeUuids.map((nodeUuid) =>
        this.entityNodeRepository.deleteIfSoleMentioned(nodeUuid),
      ),
    );

    // Load and delete entity edges first created by this episode
    const edgeUuids = await this.entityEdgeRepository.getUuidsForEpisodeDeletion(uuid);
    if (edgeUuids.length > 0) {
      await this.entityEdgeRepository.deleteByUuids(edgeUuids);
    }

    // Delete MENTIONS edges for this episode
    await this.episodicEdgeRepository.deleteBySourceUuid(uuid);

    // Delete episode node
    await this.episodicNodeRepository.delete(uuid);
  }

  // TODO: For very large batches a bulk Cypher variant would be preferred over
  // sequential per-episode deletion.
  async deleteEpisodesByUuid(uuids: Uuid[]): Promise<void> {
    await Promise.all(uuids.map((uuid) => this.deleteEpisode(uuid)));
  }

  async summarizeSaga(options: {
    userId: number;
    sagaUuid: Uuid;
    groupId: GroupId;
  }): Promise<string> {
    const { userId, sagaUuid, groupId } = options;

    const model = await this.llmService.getActiveModel(userId);

    const saga = await this.sagaNodeRepository.getByUuid(sagaUuid);
    if (!saga) {
      throw new Error(`Saga not found: ${sagaUuid}`);
    }

    const referenceTime = saga.lastSummarizedAt ?? new Date(0);
    const newEpisodes = await this.episodicNodeRepository.retrieveEpisodes(
      RetrieveEpisodesParamsSchema.parse({
        referenceTime: new Date(),
        lastN: 100,
        groupIds: [groupId],
        sagaUuid,
      }),
    );

    const unsummarized = newEpisodes.filter((ep) => ep.validAt > referenceTime);

    if (unsummarized.length === 0) {
      return saga.summary;
    }

    const messages = buildSummarizeSagaMessages({
      existingSummary: saga.summary,
      newEpisodes: unsummarized,
    });

    const result = await model
      .withStructuredOutput(sagaSummaryJsonSchema)
      .invoke(messages);

    const updatedSaga = {
      ...saga,
      summary: result.summary,
      lastSummarizedAt: new Date(),
    };
    await this.sagaNodeRepository.save(updatedSaga);

    return updatedSaga.summary;
  }

  async addEpisode(options: AddEpisodeOptionsInput): Promise<AddEpisodeResult> {
    const {
      userId,
      episode,
      entityTypes,
      edgeTypes,
      edgeTypeMappings,
      excludedEntityTypes,
      customInstructions,
    }: AddEpisodeOptions = AddEpisodeOptionsSchema.parse(options);

    const effectiveEdgeTypeMappings = getEffectiveTypeMappings(
      edgeTypeMappings,
      edgeTypes,
    );
    const model = await this.llmService.getActiveModel(userId);

    // 2. Retrieve previous episodes
    const previousEpisodes = await this.episodicNodeRepository.retrieveEpisodes(
      RetrieveEpisodesParamsSchema.parse({
        referenceTime: episode.referenceTime,
        lastN: PREVIOUS_EPISODES_WINDOW,
        groupIds: [episode.groupId],
      }),
    );

    // 3. Create + save episode
    const episodicNode = createEpisodicNode({
      name: episode.name,
      content: episode.content,
      source: episode.source,
      sourceDescription: episode.sourceDescription,
      groupId: episode.groupId,
      validAt: episode.referenceTime,
    });
    await this.episodicNodeRepository.save(episodicNode);

    // 4. Extract nodes (with chunking for large content)
    const { extractedNodes } = await this.extractNodes(
      model,
      episodicNode,
      previousEpisodes,
      entityTypes,
      edgeTypes,
      effectiveEdgeTypeMappings,
      customInstructions,
      excludedEntityTypes,
      false,
    );

    // 5. Embed extracted nodes, then collect search-based candidates
    const embeddedNodes = await this.embeddingService.embedNodes(extractedNodes);
    const existingNodes = await this.collectNodeCandidates(
      embeddedNodes,
      episode.groupId,
    );

    // 6. Resolve nodes
    const { resolvedNodes, uuidMap } = await this.nodeResolutionService.resolveNodes(
      model,
      episodicNode,
      embeddedNodes,
      existingNodes,
      previousEpisodes,
      customInstructions,
    );

    const matchedExistingNodes = existingNodes.filter((n) =>
      [...uuidMap.values()].includes(n.uuid),
    );
    const canonicalNodes = [...resolvedNodes, ...matchedExistingNodes];

    // 7. Extract edges
    const extractedEdges = await this.edgeExtractionService.extractEdges(
      model,
      episodicNode,
      canonicalNodes,
      previousEpisodes,
      episode.referenceTime,
      customInstructions,
      edgeTypes,
      effectiveEdgeTypeMappings,
    );

    // 8. Embed extracted edges, then collect search-based candidates
    const embeddedEdges = await this.embeddingService.embedEdges(extractedEdges);
    const existingEdges = await this.collectEdgeCandidates(
      embeddedEdges,
      episode.groupId,
    );

    // 9. Resolve edges
    const { resolvedEdges, invalidatedEdges } =
      await this.edgeResolutionService.resolveEdges(
        model,
        episodicNode,
        embeddedEdges,
        existingEdges,
        uuidMap,
        episode.referenceTime,
        previousEpisodes,
        customInstructions,
      );

    episodicNode.entityEdges = [...resolvedEdges, ...invalidatedEdges].map((e) => e.uuid);

    // 9.5. Per-node and per-edge episode context (single-episode: all map to the same context)
    const nodeContext = new Map<
      Uuid,
      { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }
    >(canonicalNodes.map((n) => [n.uuid, { episode: episodicNode, previousEpisodes }]));

    const edgeContext = new Map<Uuid, { referenceTime: Date }>(
      resolvedEdges.map((e) => [e.uuid, { referenceTime: episodicNode.validAt }]),
    );

    // 9.6. Extract edge attributes post-resolution (custom edge types)
    await this.extractEdgeAttributes(
      model,
      resolvedEdges,
      canonicalNodes,
      edgeTypes,
      effectiveEdgeTypeMappings,
      edgeContext,
    );

    // 9.7. Extract entity attributes post-resolution (with resolved-edge context)
    await this.extractEntityAttributes(
      model,
      resolvedNodes,
      resolvedEdges,
      entityTypes,
      nodeContext,
    );

    // 10. Generate node summaries for newly resolved nodes
    await this.summarizeNodes(model, resolvedNodes, resolvedEdges, nodeContext);

    // 11. Build episodic edges
    const episodicEdges = canonicalNodes.map((n) =>
      createEpisodicEdge({
        sourceNodeUuid: episodicNode.uuid,
        targetNodeUuid: n.uuid,
        groupId: episode.groupId,
      }),
    );

    // 12. Persist all in parallel
    await Promise.all([
      this.entityNodeRepository.saveBulk(resolvedNodes),
      this.entityEdgeRepository.saveBulk(resolvedEdges),
      this.entityEdgeRepository.saveBulk(invalidatedEdges),
      this.episodicEdgeRepository.saveBulk(episodicEdges),
      this.episodicNodeRepository.save(episodicNode),
    ]);

    // 13. Saga association
    if (episode.sagaUuid) {
      await this.sagaNodeRepository.save(
        createSagaNode({
          uuid: episode.sagaUuid,
          name: NodeNameSchema.parse(episode.sagaUuid),
          groupId: episode.groupId,
        }),
      );
      await this.hasEpisodeEdgeRepository.save(
        createHasEpisodeEdge({
          sourceNodeUuid: episode.sagaUuid,
          targetNodeUuid: episodicNode.uuid,
          groupId: episode.groupId,
        }),
      );

      const [prevEpisode] = await this.episodicNodeRepository.retrieveEpisodes(
        RetrieveEpisodesParamsSchema.parse({
          referenceTime: episode.referenceTime,
          lastN: 1,
          sagaUuid: episode.sagaUuid,
        }),
      );
      if (prevEpisode && prevEpisode.uuid !== episodicNode.uuid) {
        await this.nextEpisodeEdgeRepository.save(
          createNextEpisodeEdge({
            sourceNodeUuid: prevEpisode.uuid,
            targetNodeUuid: episodicNode.uuid,
            groupId: episode.groupId,
          }),
        );
      }
    }

    // 14. Build communities (opt-in)
    if (options.updateCommunities) {
      await this.communityService.buildCommunities(userId, episode.groupId);
    }

    return {
      episode: episodicNode,
      nodes: resolvedNodes,
      edges: resolvedEdges,
      invalidatedEdges,
      episodicEdges,
    };
  }

  // * REFACTORING *

  async extractNodes(
    model: BaseChatModel,
    episode: EpisodicNode,
    previousEpisodesForEpisode: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    edgeTypes?: EdgeTypeMap,
    edgeTypeMappings?: EdgeTypeMappings,
    customInstructions?: string,
    excludedEntityTypes?: string[],
    useCombinedExtraction: boolean = false,
  ): Promise<{
    extractedNodes: EntityNode[];
    preExtractedEdges?: EntityEdge[];
  }> {
    if (useCombinedExtraction) {
      const { nodes, edges } = await this.combinedExtractionService.extractNodesAndEdges(
        model,
        [episode],
        entityTypes,
        edgeTypes,
        edgeTypeMappings,
        customInstructions,
        excludedEntityTypes,
      );
      return { extractedNodes: nodes, preExtractedEdges: edges };
    }

    if (shouldChunk(episode.content)) {
      const chunks = await chunkContent(episode.content, episode.source);
      const perChunk = await Promise.all(
        chunks.map((chunk) =>
          this.nodeExtractionService.extractNodes(
            model,
            { ...episode, content: chunk },
            previousEpisodesForEpisode,
            entityTypes,
            customInstructions,
            excludedEntityTypes,
          ),
        ),
      );
      // Deduplicate nodes across chunks by case-insensitive name (first occurrence wins)
      const nodesByName = new Map<string, EntityNode>();

      for (const nodes of perChunk) {
        for (const node of nodes) {
          const key = node.name.toLowerCase();
          if (!nodesByName.has(key)) nodesByName.set(key, node);
        }
      }
      return { extractedNodes: [...nodesByName.values()] };
    }

    return {
      extractedNodes: await this.nodeExtractionService.extractNodes(
        model,
        episode,
        previousEpisodesForEpisode,
        entityTypes,
        customInstructions,
        excludedEntityTypes,
      ),
    };
  }

  private async collectNodeCandidates(
    nodes: EntityNode[],
    groupId: GroupId,
  ): Promise<EntityNode[]> {
    const results = await Promise.all(
      nodes.flatMap((n) => [
        this.entityNodeRepository.searchByName(
          SearchByTextParamsSchema.parse({
            query: n.name,
            groupIds: [groupId],
            limit: CANDIDATE_LIMIT,
          }),
        ),
        n.nameEmbedding !== null
          ? this.entityNodeRepository.searchBySimilarity(
              SearchBySimilarityParamsSchema.parse({
                embedding: n.nameEmbedding,
                groupIds: [groupId],
                limit: CANDIDATE_LIMIT,
              }),
            )
          : Promise.resolve([] as EntityNode[]),
      ]),
    );
    const seen = new Set<Uuid>();
    return results.flat().filter((n) => {
      if (seen.has(n.uuid)) return false;
      seen.add(n.uuid);
      return true;
    });
  }

  private async collectEdgeCandidates(
    edges: EntityEdge[],
    groupId: GroupId,
  ): Promise<EntityEdge[]> {
    const results = await Promise.all(
      edges.flatMap((e) => [
        this.entityEdgeRepository.searchByFact(
          SearchByTextParamsSchema.parse({
            query: e.fact,
            groupIds: [groupId],
            limit: CANDIDATE_LIMIT,
          }),
        ),
        e.factEmbedding !== null
          ? this.entityEdgeRepository.searchBySimilarity(
              SearchBySimilarityParamsSchema.parse({
                embedding: e.factEmbedding,
                groupIds: [groupId],
                limit: CANDIDATE_LIMIT,
              }),
            )
          : Promise.resolve([] as EntityEdge[]),
      ]),
    );
    const seen = new Set<Uuid>();
    return results.flat().filter((e) => {
      if (seen.has(e.uuid)) return false;
      seen.add(e.uuid);
      return true;
    });
  }

  private async summarizeNodes(
    model: BaseChatModel,
    nodes: EntityNode[],
    allEdges: EntityEdge[],
    nodeContext: Map<Uuid, { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }>,
  ): Promise<void> {
    if (nodes.length === 0) return;

    // Group nodes by their originating episode so each node is summarized with its own context.
    const nodesByEpisode = new Map<
      Uuid,
      { episode: EpisodicNode; previousEpisodes: EpisodicNode[]; nodes: EntityNode[] }
    >();

    for (const node of nodes) {
      const ctx = nodeContext.get(node.uuid);
      if (!ctx) continue;
      const entry = nodesByEpisode.get(ctx.episode.uuid);
      if (entry) {
        entry.nodes.push(node);
      } else {
        nodesByEpisode.set(ctx.episode.uuid, {
          episode: ctx.episode,
          previousEpisodes: ctx.previousEpisodes,
          nodes: [node],
        });
      }
    }

    const summaryMap = new Map<Uuid, string>();
    for (const {
      episode,
      previousEpisodes,
      nodes: groupNodes,
    } of nodesByEpisode.values()) {
      const summaryInput = groupNodes.map((n) => ({
        uuid: n.uuid,
        name: n.name,
        summary: n.summary,
        facts: allEdges
          .filter((e) => e.sourceNodeUuid === n.uuid || e.targetNodeUuid === n.uuid)
          .map((e) => e.fact),
      }));

      for (let i = 0; i < summaryInput.length; i += MAX_NODES_PER_SUMMARY_BATCH) {
        const batch = summaryInput.slice(i, i + MAX_NODES_PER_SUMMARY_BATCH);
        const summaryMessages = buildNodeSummaryMessages({
          episode,
          previousEpisodes,
          nodes: batch,
        });
        const summaryResult = await model
          .withStructuredOutput(nodeSummaryJsonSchema)
          .invoke(summaryMessages);
        for (const s of summaryResult.summaries) {
          summaryMap.set(s.uuid, s.summary);
        }
      }
    }

    for (const node of nodes) {
      const summary = summaryMap.get(node.uuid);
      if (summary !== undefined) node.summary = summary;
    }
  }

  private async extractEntityAttributes(
    model: BaseChatModel,
    nodes: EntityNode[],
    allEdges: EntityEdge[],
    entityTypes: EntityTypeMap | undefined,
    nodeContext: Map<Uuid, { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }>,
  ): Promise<void> {
    if (!entityTypes) return;
    for (const node of nodes) {
      const label = node.labels.find((l) => l !== 'Entity');
      const entityType = label ? entityTypes[label] : undefined;
      if (!entityType) continue;
      const ctx = nodeContext.get(node.uuid);
      if (!ctx) continue;
      const nodeEdges = allEdges.filter(
        (e) => e.sourceNodeUuid === node.uuid || e.targetNodeUuid === node.uuid,
      );
      const attrMessages = buildExtractEntityAttributesMessages({
        episodeContent: ctx.episode.content,
        previousEpisodesContent: ctx.previousEpisodes.map((ep) => ep.content),
        relatedFacts: nodeEdges.map((e) => e.fact),
        referenceTime: ctx.episode.validAt,
        existingAttributes: node.attributes ?? {},
      });
      const attrs = (await model
        .withStructuredOutput(z.toJSONSchema(entityType.schema))
        .invoke(attrMessages)) as Record<string, unknown>;
      node.attributes = { ...node.attributes, ...attrs };
    }
  }

  private async extractEdgeAttributes(
    model: BaseChatModel,
    resolvedEdges: EntityEdge[],
    canonicalNodes: EntityNode[],
    edgeTypes: EdgeTypeMap | undefined,
    edgeTypeMappings: EdgeTypeMappings | undefined,
    edgeContext: Map<Uuid, { referenceTime: Date }>,
  ): Promise<void> {
    if (!edgeTypes || !edgeTypeMappings) return;
    const uuidToNode = new Map<Uuid, EntityNode>(canonicalNodes.map((n) => [n.uuid, n]));

    type EdgeAttrTask = {
      edge: EntityEdge;
      jsonSchema: { properties?: Record<string, unknown> };
      referenceTime: Date;
    };
    const tasks: EdgeAttrTask[] = [];
    for (const edge of resolvedEdges) {
      const src = uuidToNode.get(edge.sourceNodeUuid);
      const tgt = uuidToNode.get(edge.targetNodeUuid);
      if (!src || !tgt) continue;
      const applicable = getApplicableEdgeTypes(
        src.labels,
        tgt.labels,
        edgeTypes,
        edgeTypeMappings,
      );
      const typeDef = applicable[edge.name];
      if (!typeDef) continue;
      const jsonSchema = z.toJSONSchema(typeDef.schema) as {
        properties?: Record<string, unknown>;
      };
      if (Object.keys(jsonSchema.properties ?? {}).length === 0) continue;
      const ctx = edgeContext.get(edge.uuid);
      if (!ctx) continue;
      tasks.push({ edge, jsonSchema, referenceTime: ctx.referenceTime });
    }

    await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      tasks.map(({ edge, jsonSchema, referenceTime }) => async () => {
        const attrs = (await model.withStructuredOutput(jsonSchema).invoke(
          buildExtractEdgeAttributesMessages({
            fact: edge.fact,
            referenceTime,
            existingAttributes: edge.attributes ?? {},
          }),
        )) as Record<string, unknown>;
        edge.attributes = { ...edge.attributes, ...attrs };
      }),
    );
  }

  // * REFACTORING END *
}
