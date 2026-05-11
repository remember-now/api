import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { LlmService } from '@/llm/llm.service';

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
  buildNodeSummaryMessages,
  buildSummarizeSagaMessages,
  sagaSummaryJsonSchema,
} from '../prompts';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import {
  COSINE_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  normalizeString,
} from '../resolution/resolution-utils';
import {
  buildDirectedUuidMap,
  LLM_CONCURRENCY_LIMIT,
  reassembleByOffsets,
  resolveEdgePointers,
  withConcurrency,
} from './batch-utils';
import { chunkContent, shouldChunk } from './content-chunking';
import { getApplicableEdgeTypes, getEffectiveTypeMappings } from './episode-utils';
import {
  AddEpisodeOptions,
  AddEpisodeOptionsInput,
  AddEpisodeOptionsSchema,
  AddEpisodeResult,
  CANDIDATE_LIMIT,
  EdgeTypeMap,
  EdgeTypeMappings,
  EntityTypeMap,
  MAX_NODES_PER_SUMMARY_BATCH,
  nodeSummaryJsonSchema,
  PREVIOUS_EPISODES_WINDOW,
} from './types';

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

  async addEpisodes(options: AddEpisodeOptionsInput): Promise<AddEpisodeResult[]> {
    const {
      userId,
      episodes,
      entityTypes,
      edgeTypes,
      edgeTypeMappings,
      excludedEntityTypes,
      customInstructions,
      updateCommunities,
      useCombinedExtraction,
    }: AddEpisodeOptions = AddEpisodeOptionsSchema.parse(options);

    const effectiveEdgeTypeMappings = getEffectiveTypeMappings(
      edgeTypeMappings,
      edgeTypes,
    );
    const model = await this.llmService.getActiveModel(userId);

    // 2. Retrieve previous episodes in parallel
    const prevEpisodesPerEpisode = await Promise.all(
      episodes.map((ep) =>
        this.episodicNodeRepository.retrieveEpisodes(
          RetrieveEpisodesParamsSchema.parse({
            referenceTime: ep.referenceTime,
            lastN: PREVIOUS_EPISODES_WINDOW,
            groupIds: [ep.groupId],
          }),
        ),
      ),
    );

    // 3. Create + save episodic nodes (apply uuid override if provided)
    const episodicNodes = episodes.map((raw) => {
      const node = createEpisodicNode({
        name: raw.name,
        content: raw.content,
        source: raw.source,
        sourceDescription: raw.sourceDescription,
        groupId: raw.groupId,
        validAt: raw.referenceTime,
      });
      return raw.uuid ? { ...node, uuid: raw.uuid } : node;
    });
    await this.episodicNodeRepository.saveBulk(episodicNodes);

    // 4. Extract nodes (and edges, if using combined extraction) in parallel.
    // Combined path: single LLM call per episode yields both nodes and edges.
    // Separate path: node extraction only; edges are extracted later in step 11.
    let preExtractedEdgesPerEpisode: EntityEdge[][] | null = null;

    const extractedNodesPerEpisode = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      episodicNodes.map((ep, i) => async () => {
        const { extractedNodes, preExtractedEdges } = await this.extractNodes(
          model,
          ep,
          prevEpisodesPerEpisode[i],
          entityTypes,
          edgeTypes,
          effectiveEdgeTypeMappings,
          customInstructions,
          excludedEntityTypes,
          useCombinedExtraction,
        );
        if (useCombinedExtraction) {
          (preExtractedEdgesPerEpisode ??= Array(episodicNodes.length).fill([]))[i] =
            preExtractedEdges;
        }
        return extractedNodes;
      }),
    );

    // 5. Embed all extracted nodes (batch)
    const allExtractedNodes = extractedNodesPerEpisode.flat();
    const allEmbedded = await this.embeddingService.embedNodes(allExtractedNodes);
    const embeddedPerEpisode = reassembleByOffsets(
      allEmbedded,
      extractedNodesPerEpisode.map((a) => a.length),
    );

    // 6. Collect search-based node candidates per episode
    const groupIds = [...new Set(episodes.map((e) => e.groupId))];
    const candidatesPerEpisode = await Promise.all(
      embeddedPerEpisode.map((nodes, i) =>
        this.collectNodeCandidates(nodes, episodicNodes[i].groupId),
      ),
    );
    const existingNodesMap = new Map(candidatesPerEpisode.flat().map((n) => [n.uuid, n]));

    // 7. Pass 1 — resolve nodes vs live graph in parallel
    const nodeResolutions = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      embeddedPerEpisode.map(
        (nodes, i) => () =>
          this.nodeResolutionService.resolveNodes(
            model,
            episodicNodes[i],
            nodes,
            candidatesPerEpisode[i],
            prevEpisodesPerEpisode[i],
            customInstructions,
          ),
      ),
    );

    // 8. Merge duplicate pairs from pass 1
    const pass1Pairs: [Uuid, Uuid][] = nodeResolutions.flatMap((r) =>
      r.duplicatePairs.map((p): [Uuid, Uuid] => [p.extractedUuid, p.canonicalUuid]),
    );

    // 9. Pass 2 — within-batch dedup: exact name match first, then cosine
    const allNewNodes = nodeResolutions.flatMap((r) => r.resolvedNodes);
    const pass2Pairs: [Uuid, Uuid][] = [];
    for (let i = 0; i < allNewNodes.length; i++) {
      for (let j = i + 1; j < allNewNodes.length; j++) {
        const a = allNewNodes[i];
        const b = allNewNodes[j];

        const exactMatch = normalizeString(a.name) === normalizeString(b.name);
        const cosineMatch =
          !exactMatch &&
          a.nameEmbedding !== null &&
          b.nameEmbedding !== null &&
          cosineSimilarity(a.nameEmbedding, b.nameEmbedding) >=
            COSINE_SIMILARITY_THRESHOLD;

        if (exactMatch || cosineMatch) {
          pass2Pairs.push([b.uuid, a.uuid]); // b is alias → a (first-seen) is canonical
        }
      }
    }

    const finalUuidMap = buildDirectedUuidMap([...pass1Pairs, ...pass2Pairs]);

    // 10. Determine canonical nodes per episode
    const canonicalNodesPerEpisode = nodeResolutions.map((resolution) => {
      const ownCanonical = resolution.resolvedNodes.filter(
        (n) => (finalUuidMap.get(n.uuid) ?? n.uuid) === n.uuid,
      );
      const matchedExisting = resolution.duplicatePairs
        .map((p) => {
          const canonical = finalUuidMap.get(p.canonicalUuid) ?? p.canonicalUuid;
          return existingNodesMap.get(canonical);
        })
        .filter((n): n is NonNullable<typeof n> => n !== undefined);

      const seen = new Set<Uuid>();
      return [...ownCanonical, ...matchedExisting].filter((n) => {
        if (seen.has(n.uuid)) return false;
        seen.add(n.uuid);
        return true;
      });
    });

    // 11. Extract edges in parallel, then resolve pointers.
    // Combined path: edges were already extracted in step 4; remap node UUIDs via finalUuidMap.
    // Separate path: extract edges using the canonical nodes resolved above.
    const rawEdgesPerEpisode = preExtractedEdgesPerEpisode
      ? preExtractedEdgesPerEpisode
      : await withConcurrency(
          LLM_CONCURRENCY_LIMIT,
          episodicNodes.map(
            (ep, i) => () =>
              this.edgeExtractionService.extractEdges(
                model,
                ep,
                canonicalNodesPerEpisode[i],
                prevEpisodesPerEpisode[i],
                ep.validAt,
                customInstructions,
                edgeTypes,
                effectiveEdgeTypeMappings,
              ),
          ),
        );

    const pointedEdgesPerEpisode = rawEdgesPerEpisode.map((edges) =>
      resolveEdgePointers(edges, finalUuidMap),
    );

    // 12. Embed all extracted edges (batch)
    const allExtractedEdges = pointedEdgesPerEpisode.flat();
    const allEmbeddedEdges = await this.embeddingService.embedEdges(allExtractedEdges);
    const embeddedEdgesPerEpisode = reassembleByOffsets(
      allEmbeddedEdges,
      pointedEdgesPerEpisode.map((a) => a.length),
    );

    // 13. Collect search-based edge candidates per episode
    const edgeCandidatesPerEpisode = await Promise.all(
      embeddedEdgesPerEpisode.map((edges, i) =>
        this.collectEdgeCandidates(edges, episodicNodes[i].groupId),
      ),
    );

    // 14. Resolve edges in parallel
    const edgeResolutions = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      episodicNodes.map(
        (ep, i) => () =>
          this.edgeResolutionService.resolveEdges(
            model,
            ep,
            embeddedEdgesPerEpisode[i],
            edgeCandidatesPerEpisode[i],
            finalUuidMap,
            ep.validAt,
            prevEpisodesPerEpisode[i],
            customInstructions,
          ),
      ),
    );

    const allResolvedEdges = edgeResolutions.flatMap((r) => r.resolvedEdges);
    const allInvalidatedEdges = edgeResolutions.flatMap((r) => r.invalidatedEdges);

    edgeResolutions.forEach((res, i) => {
      episodicNodes[i].entityEdges = [...res.resolvedEdges, ...res.invalidatedEdges].map(
        (e) => e.uuid,
      );
    });

    // 15. Build per-node and per-edge episode context for the helpers below
    const allCanonicalNodes = [
      ...new Map(canonicalNodesPerEpisode.flat().map((n) => [n.uuid, n])).values(),
    ];
    const newNodesOnly = allCanonicalNodes.filter((n) => !existingNodesMap.has(n.uuid));

    const nodeContext = new Map<
      Uuid,
      { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }
    >();
    canonicalNodesPerEpisode.forEach((nodes, i) => {
      for (const n of nodes) {
        if (!nodeContext.has(n.uuid)) {
          nodeContext.set(n.uuid, {
            episode: episodicNodes[i],
            previousEpisodes: prevEpisodesPerEpisode[i],
          });
        }
      }
    });

    const edgeContext = new Map<Uuid, { referenceTime: Date }>();
    edgeResolutions.forEach((res, epIndex) => {
      for (const edge of res.resolvedEdges) {
        edgeContext.set(edge.uuid, { referenceTime: episodicNodes[epIndex].validAt });
      }
    });

    // 16. Extract edge attributes post-resolution (custom edge types)
    await this.extractEdgeAttributes(
      model,
      allResolvedEdges,
      allCanonicalNodes,
      edgeTypes,
      effectiveEdgeTypeMappings,
      edgeContext,
    );

    // 17. Extract entity attributes post-resolution (with resolved-edge context)
    await this.extractEntityAttributes(
      model,
      newNodesOnly,
      allResolvedEdges,
      entityTypes,
      nodeContext,
    );

    // 18. Generate node summaries for all new canonical nodes
    await this.summarizeNodes(model, newNodesOnly, allResolvedEdges, nodeContext);

    // 19. Create episodic edges per episode
    const episodicEdgesPerEpisode = episodicNodes.map((ep, i) =>
      canonicalNodesPerEpisode[i].map((node) =>
        createEpisodicEdge({
          sourceNodeUuid: ep.uuid,
          targetNodeUuid: node.uuid,
          groupId: ep.groupId,
        }),
      ),
    );
    const allEpisodicEdges = episodicEdgesPerEpisode.flat();

    // 20. Persist in parallel
    await Promise.all([
      this.entityNodeRepository.saveBulk(allCanonicalNodes),
      this.entityEdgeRepository.saveBulk(allResolvedEdges),
      this.entityEdgeRepository.saveBulk(allInvalidatedEdges),
      this.episodicEdgeRepository.saveBulk(allEpisodicEdges),
      this.episodicNodeRepository.saveBulk(episodicNodes),
    ]);

    // 21. Saga association per episode (sequential — keeps NEXT_EPISODE chain
    // deterministic when multiple batch episodes share the same sagaUuid).
    for (let i = 0; i < episodes.length; i++) {
      const raw = episodes[i];
      if (!raw.sagaUuid) continue;
      const epNode = episodicNodes[i];

      await this.sagaNodeRepository.save(
        createSagaNode({
          uuid: raw.sagaUuid,
          name: NodeNameSchema.parse(raw.sagaUuid),
          groupId: raw.groupId,
        }),
      );
      await this.hasEpisodeEdgeRepository.save(
        createHasEpisodeEdge({
          sourceNodeUuid: raw.sagaUuid,
          targetNodeUuid: epNode.uuid,
          groupId: raw.groupId,
        }),
      );

      const [prevEpisode] = await this.episodicNodeRepository.retrieveEpisodes(
        RetrieveEpisodesParamsSchema.parse({
          referenceTime: raw.referenceTime,
          lastN: 1,
          sagaUuid: raw.sagaUuid,
        }),
      );
      if (prevEpisode && prevEpisode.uuid !== epNode.uuid) {
        await this.nextEpisodeEdgeRepository.save(
          createNextEpisodeEdge({
            sourceNodeUuid: prevEpisode.uuid,
            targetNodeUuid: epNode.uuid,
            groupId: raw.groupId,
          }),
        );
      }
    }

    // 22. Optional community build per distinct groupId
    // TODO: Concurrent addEpisodes calls for the same groupId can race here —
    // two community builds may project conflicting graph snapshots and race on
    // deleteByGroupId. Investigate a per-groupId mutex or advisory lock before
    // enabling concurrent bulk ingestion.
    if (updateCommunities) {
      await Promise.all(
        groupIds.map((gid) => this.communityService.buildCommunities(userId, gid)),
      );
    }

    // TODO: per-entry `nodes` includes both newly-resolved canonical nodes AND
    // existing nodes matched via cross-batch dedup. The same canonical EntityNode
    // may therefore appear in multiple entries' `nodes` arrays — callers must
    // dedupe by uuid if they want a unique set across the batch
    // (`result.flatMap(r => r.nodes)` will overcount). Consider returning a
    // separate top-level deduped `nodes` field if a unique-view is needed.
    return episodicNodes.map(
      (episode, i): AddEpisodeResult => ({
        episode,
        nodes: canonicalNodesPerEpisode[i],
        edges: edgeResolutions[i].resolvedEdges,
        invalidatedEdges: edgeResolutions[i].invalidatedEdges,
        episodicEdges: episodicEdgesPerEpisode[i],
      }),
    );
  }

  private async extractNodes(
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
}
