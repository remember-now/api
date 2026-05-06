import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { LlmService } from '@/llm/llm.service';

import { chunkContent, shouldChunk } from '../bulk/content-chunking';
import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import {
  createEpisodicEdge,
  createHasEpisodeEdge,
  createNextEpisodeEdge,
  EntityEdge,
} from '../models/edges';
import {
  createEpisodicNode,
  createSagaNode,
  EntityNode,
  EpisodeType,
  EpisodicNode,
} from '../models/nodes';
import { GroupIdSchema } from '../neo4j';
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
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import {
  AddEpisodeOptions,
  AddEpisodeResult,
  EdgeTypeMap,
  getApplicableEdgeTypes,
  nodeSummaryJsonSchema,
} from './episode.types';
import { buildNodeSummaryMessages } from './node-summary.prompts';

const PREVIOUS_EPISODES_WINDOW = 20;
const MAX_NODES_PER_SUMMARY_BATCH = 30;
const CANDIDATE_LIMIT = 10;

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
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly entityEdgeRepository: EntityEdgeRepository,
    private readonly episodicNodeRepository: EpisodicNodeRepository,
    private readonly episodicEdgeRepository: EpisodicEdgeRepository,
    private readonly sagaNodeRepository: SagaNodeRepository,
    private readonly hasEpisodeEdgeRepository: HasEpisodeEdgeRepository,
    private readonly nextEpisodeEdgeRepository: NextEpisodeEdgeRepository,
  ) {}

  async getEpisodes(options: {
    groupIds: string[];
    referenceTime?: Date;
    lastN?: number;
    source?: EpisodeType;
    sagaUuid?: string;
  }): Promise<EpisodicNode[]> {
    const {
      groupIds,
      referenceTime = new Date(),
      lastN = 10,
      source,
      sagaUuid,
    } = options;
    return this.episodicNodeRepository.retrieveEpisodes(
      referenceTime,
      lastN,
      groupIds,
      source,
      sagaUuid,
    );
  }

  async deleteEpisode(uuid: string): Promise<void> {
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
    const edgeUuids =
      await this.entityEdgeRepository.getUuidsForEpisodeDeletion(uuid);
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
  async deleteEpisodesByUuid(uuids: string[]): Promise<void> {
    await Promise.all(uuids.map((uuid) => this.deleteEpisode(uuid)));
  }

  async addEpisode(options: AddEpisodeOptions): Promise<AddEpisodeResult> {
    const {
      userId,
      name,
      content,
      source = EpisodeType.text,
      sourceDescription = '',
      groupId,
      referenceTime = new Date(),
      sagaUuid,
      entityTypes,
      edgeTypes,
      edgeTypeMap,
      excludedEntityTypes,
      customInstructions,
    } = options;

    const effectiveEdgeTypeMap: EdgeTypeMap | undefined =
      edgeTypeMap ??
      (edgeTypes ? { 'Entity,Entity': Object.keys(edgeTypes) } : undefined);

    GroupIdSchema.parse(groupId);

    // 1. Get active model
    const model = await this.llmService.getActiveModel(userId);

    // 2. Retrieve previous episodes
    const previousEpisodes = await this.episodicNodeRepository.retrieveEpisodes(
      referenceTime,
      PREVIOUS_EPISODES_WINDOW,
      [groupId],
    );

    // 3. Create + save episode
    const episode = createEpisodicNode({
      name,
      content,
      source,
      sourceDescription,
      groupId,
      validAt: referenceTime,
    });
    await this.episodicNodeRepository.save(episode);

    // 4. Extract nodes (with chunking for large content)
    let extractedNodes: EntityNode[];
    if (shouldChunk(content)) {
      const chunks = await chunkContent(content, source);
      const perChunk = await Promise.all(
        chunks.map((chunk) =>
          this.nodeExtractionService.extractNodes(
            model,
            { ...episode, content: chunk },
            previousEpisodes,
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
      extractedNodes = [...nodesByName.values()];
    } else {
      extractedNodes = await this.nodeExtractionService.extractNodes(
        model,
        episode,
        previousEpisodes,
        entityTypes,
        customInstructions,
        excludedEntityTypes,
      );
    }

    // 5. Embed extracted nodes, then collect search-based candidates
    const embeddedNodes =
      await this.embeddingService.embedNodes(extractedNodes);
    const existingNodes = await this.collectNodeCandidates(
      embeddedNodes,
      groupId,
    );

    // 6. Resolve nodes
    const { resolvedNodes, uuidMap } =
      await this.nodeResolutionService.resolveNodes(
        model,
        episode,
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
      episode,
      canonicalNodes,
      previousEpisodes,
      referenceTime,
      customInstructions,
      edgeTypes,
      effectiveEdgeTypeMap,
    );

    // 8. Embed extracted edges, then collect search-based candidates
    const embeddedEdges =
      await this.embeddingService.embedEdges(extractedEdges);
    const existingEdges = await this.collectEdgeCandidates(
      embeddedEdges,
      groupId,
    );

    // 9. Resolve edges
    const { resolvedEdges, invalidatedEdges } =
      await this.edgeResolutionService.resolveEdges(
        model,
        episode,
        embeddedEdges,
        existingEdges,
        uuidMap,
        referenceTime,
        previousEpisodes,
        customInstructions,
      );

    episode.entityEdges = [...resolvedEdges, ...invalidatedEdges].map(
      (e) => e.uuid,
    );

    // 9.5. Extract entity attributes post-resolution (with resolved-edge context)
    for (const node of resolvedNodes) {
      const label = node.labels.find((l) => l !== 'Entity');
      const entityType = label ? entityTypes?.[label] : undefined;
      if (entityType) {
        const nodeEdges = resolvedEdges.filter(
          (e) =>
            e.sourceNodeUuid === node.uuid || e.targetNodeUuid === node.uuid,
        );
        const attrMessages = buildExtractEntityAttributesMessages({
          episodeContent: episode.content,
          previousEpisodesContent: previousEpisodes.map((ep) => ep.content),
          relatedFacts: nodeEdges.map((e) => e.fact),
          referenceTime: episode.validAt,
          existingAttributes: node.attributes ?? {},
        });
        const attrs = (await model
          .withStructuredOutput(z.toJSONSchema(entityType.schema))
          .invoke(attrMessages)) as Record<string, unknown>;
        node.attributes = { ...node.attributes, ...attrs };
      }
    }

    // 9.6. Extract edge attributes post-resolution (custom edge types)
    if (edgeTypes && effectiveEdgeTypeMap) {
      const uuidToNode = new Map<string, EntityNode>(
        canonicalNodes.map((n) => [n.uuid, n]),
      );
      for (const edge of resolvedEdges) {
        const src = uuidToNode.get(edge.sourceNodeUuid);
        const tgt = uuidToNode.get(edge.targetNodeUuid);
        if (!src || !tgt) continue;
        const applicable = getApplicableEdgeTypes(
          src.labels,
          tgt.labels,
          edgeTypes,
          effectiveEdgeTypeMap,
        );
        const typeDef = applicable[edge.name];
        if (!typeDef) continue;
        const jsonSchema = z.toJSONSchema(typeDef.schema) as {
          properties?: Record<string, unknown>;
        };
        if (Object.keys(jsonSchema.properties ?? {}).length === 0) continue;
        const attrs = (await model.withStructuredOutput(jsonSchema).invoke(
          buildExtractEdgeAttributesMessages({
            fact: edge.fact,
            referenceTime: episode.validAt,
            existingAttributes: edge.attributes ?? {},
          }),
        )) as Record<string, unknown>;
        edge.attributes = { ...edge.attributes, ...attrs };
      }
    }

    // 10. Generate node summaries for newly resolved nodes
    if (resolvedNodes.length > 0) {
      const nodeSummaryInput = resolvedNodes.map((n) => ({
        uuid: n.uuid,
        name: n.name,
        summary: n.summary,
        facts: resolvedEdges
          .filter(
            (e) => e.sourceNodeUuid === n.uuid || e.targetNodeUuid === n.uuid,
          )
          .map((e) => e.fact),
      }));

      const summaryMap = new Map<string, string>();
      for (
        let i = 0;
        i < nodeSummaryInput.length;
        i += MAX_NODES_PER_SUMMARY_BATCH
      ) {
        const batch = nodeSummaryInput.slice(
          i,
          i + MAX_NODES_PER_SUMMARY_BATCH,
        );
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

      for (const node of resolvedNodes) {
        const summary = summaryMap.get(node.uuid);
        if (summary !== undefined) {
          node.summary = summary;
        }
      }
    }

    // 11. Build episodic edges
    const episodicEdges = canonicalNodes.map((n) =>
      createEpisodicEdge({
        sourceNodeUuid: episode.uuid,
        targetNodeUuid: n.uuid,
        groupId,
      }),
    );

    // 12. Persist all in parallel
    await Promise.all([
      this.entityNodeRepository.saveBulk(resolvedNodes),
      this.entityEdgeRepository.saveBulk(resolvedEdges),
      this.entityEdgeRepository.saveBulk(invalidatedEdges),
      this.episodicEdgeRepository.saveBulk(episodicEdges),
      this.episodicNodeRepository.save(episode),
    ]);

    // 13. Saga association
    if (sagaUuid) {
      await this.sagaNodeRepository.save(
        createSagaNode({ uuid: sagaUuid, name: sagaUuid, groupId }),
      );
      await this.hasEpisodeEdgeRepository.save(
        createHasEpisodeEdge({
          sourceNodeUuid: sagaUuid,
          targetNodeUuid: episode.uuid,
          groupId,
        }),
      );

      const [prevEpisode] = await this.episodicNodeRepository.retrieveEpisodes(
        referenceTime,
        1,
        undefined,
        undefined,
        sagaUuid,
      );
      if (prevEpisode && prevEpisode.uuid !== episode.uuid) {
        await this.nextEpisodeEdgeRepository.save(
          createNextEpisodeEdge({
            sourceNodeUuid: prevEpisode.uuid,
            targetNodeUuid: episode.uuid,
            groupId,
          }),
        );
      }
    }

    // 14. Build communities (opt-in)
    if (options.updateCommunities) {
      await this.communityService.buildCommunities(userId, groupId);
    }

    return {
      episode,
      nodes: resolvedNodes,
      edges: resolvedEdges,
      invalidatedEdges,
      episodicEdges,
    };
  }

  private async collectNodeCandidates(
    nodes: EntityNode[],
    groupId: string,
  ): Promise<EntityNode[]> {
    const results = await Promise.all(
      nodes.flatMap((n) => [
        this.entityNodeRepository.searchByName(
          n.name,
          [groupId],
          CANDIDATE_LIMIT,
        ),
        n.nameEmbedding !== null
          ? this.entityNodeRepository.searchBySimilarity(
              n.nameEmbedding,
              [groupId],
              CANDIDATE_LIMIT,
            )
          : Promise.resolve([] as EntityNode[]),
      ]),
    );
    const seen = new Set<string>();
    return results.flat().filter((n) => {
      if (seen.has(n.uuid)) return false;
      seen.add(n.uuid);
      return true;
    });
  }

  private async collectEdgeCandidates(
    edges: EntityEdge[],
    groupId: string,
  ): Promise<EntityEdge[]> {
    const results = await Promise.all(
      edges.flatMap((e) => [
        this.entityEdgeRepository.searchByFact(
          e.fact,
          [groupId],
          CANDIDATE_LIMIT,
        ),
        e.factEmbedding !== null
          ? this.entityEdgeRepository.searchBySimilarity(
              e.factEmbedding,
              [groupId],
              CANDIDATE_LIMIT,
            )
          : Promise.resolve([] as EntityEdge[]),
      ]),
    );
    const seen = new Set<string>();
    return results.flat().filter((e) => {
      if (seen.has(e.uuid)) return false;
      seen.add(e.uuid);
      return true;
    });
  }
}
