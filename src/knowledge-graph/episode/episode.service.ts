import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { Uuid } from '@/common/schemas';
import { LlmService } from '@/llm/llm.service';
import {
  LLM_TRACER,
  type LlmContext,
  type LlmTracer,
  metricsOnResult,
  Span,
  type SpanMetrics,
} from '@/observability';

import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import {
  createEpisodicEdge,
  createEpisodicNode,
  createHasEpisodeEdge,
  createSagaNode,
  EntityEdge,
  EntityNode,
  EpisodicNode,
} from '../models';
import {
  buildExtractTimestampsMessages,
  buildFillEdgeAttributesMessages,
  buildFillEntityAttributesMessages,
  buildNodeSummaryMessages,
  buildSummarizeSagasMessages,
  edgeTimestampsJsonSchema,
  nodeSummaryJsonSchema,
  sagaSummaryJsonSchema,
} from '../prompts';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  SagaNodeRepository,
} from '../repository';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import {
  COSINE_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  normalizeString,
} from '../resolution/resolution-utils';
import {
  NodeNameSchema,
  RetrieveEpisodesParamsInput,
  RetrieveEpisodesParamsSchema,
  SearchBySimilarityParamsSchema,
  SearchByTextParamsSchema,
} from '../types';
import {
  buildDirectedIdMap,
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
  PREVIOUS_EPISODES_WINDOW,
} from './types';

const RETRIEVER_ATTRS = { 'langfuse.observation.type': 'retriever' };

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
    @Inject(LLM_TRACER) private readonly llmTracer: LlmTracer,
  ) {}

  @Span('getEpisodes')
  async getEpisodes(options: RetrieveEpisodesParamsInput): Promise<EpisodicNode[]> {
    const params = RetrieveEpisodesParamsSchema.parse(options);
    return this.episodicNodeRepository.retrieveEpisodes(params);
  }

  // TODO: Deletion is currently best-effort and leaves downstream graph state
  // inconsistent. Non-originating episodes can still mutate surviving edges
  // (invalidAt/expiredAt stamps, episodes[] arrays, node attributes); none of
  // that is unwound here. The right design is dependency-aware reconsolidation
  // on retrieval over an append-only graph, but the trade-offs only become
  // legible against a real graph with real query patterns - revisit once we
  // have one. Design notes: PLAN.md.
  async deleteEpisode(id: Uuid): Promise<void> {
    await this.deleteEpisodeImpl(id);
  }

  @Span('deleteEpisode', { onResult: metricsOnResult })
  private async deleteEpisodeImpl(id: Uuid): Promise<{ metrics: SpanMetrics }> {
    const episode = await this.episodicNodeRepository.getById(id);
    if (!episode) {
      return { metrics: { 'episode.id': id, skipped: true } };
    }

    // Load entity nodes mentioned by this episode
    const mentionedNodeIds = await this.episodicNodeRepository.getMentionedEntityIds(id);

    // Delete entity nodes that are only mentioned by this episode
    await Promise.all(
      mentionedNodeIds.map((nodeId) =>
        this.entityNodeRepository.deleteIfSoleMentioned(nodeId),
      ),
    );

    // Load and delete entity edges first created by this episode
    const edgeIds = await this.entityEdgeRepository.getIdsForEpisodeDeletion(id);
    if (edgeIds.length > 0) {
      await this.entityEdgeRepository.deleteByIds(edgeIds);
    }

    // Delete MENTIONS edges for this episode
    await this.episodicEdgeRepository.deleteBySourceId(id);

    // Delete episode node
    await this.episodicNodeRepository.delete(id);

    return {
      metrics: {
        'episode.id': id,
        'nodes.mentioned': mentionedNodeIds.length,
        'edges.deleted': edgeIds.length,
      },
    };
  }

  // TODO: For very large batches a bulk variant would be preferred over
  // sequential per-episode deletion. (graph consistency problem though)
  async deleteEpisodesById(ids: Uuid[]): Promise<void> {
    await this.deleteEpisodesByIdImpl(ids);
  }

  @Span('deleteEpisodesById', { onResult: metricsOnResult })
  private async deleteEpisodesByIdImpl(ids: Uuid[]): Promise<{ metrics: SpanMetrics }> {
    await Promise.all(ids.map((id) => this.deleteEpisode(id)));
    return { metrics: { 'episodes.count': ids.length } };
  }

  async summarizeSaga(options: {
    userId: Uuid;
    sagaId: Uuid;
    graphId: Uuid;
  }): Promise<string> {
    const { summary } = await this.summarizeSagaImpl(options);
    return summary;
  }

  @Span('summarizeSaga', { onResult: metricsOnResult })
  private async summarizeSagaImpl(options: {
    userId: Uuid;
    sagaId: Uuid;
    graphId: Uuid;
  }): Promise<{ summary: string; metrics: SpanMetrics }> {
    const { userId, sagaId, graphId } = options;
    const ctx: LlmContext = {
      userId,
      sessionId: userId,
      tags: ['knowledge-graph', 'saga'],
      metadata: { sagaId, graphId },
    };

    const baseMetrics: SpanMetrics = {
      'user.id': ctx.userId,
      'session.id': ctx.sessionId ?? ctx.userId,
      'saga.id': sagaId,
      'graph.id': graphId,
    };

    const model = await this.llmService.getActiveModel(userId);

    const saga = await this.sagaNodeRepository.getById(sagaId);
    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    const referenceTime = saga.lastSummarizedAt ?? new Date(0);
    // retrieveEpisodes returns newest-first; the LLM summary expects narrative
    // order (oldest-first) so events read sequentially.
    const newEpisodes = (
      await this.episodicNodeRepository.retrieveEpisodes(
        RetrieveEpisodesParamsSchema.parse({
          referenceTime: new Date(),
          lastN: 100,
          graphIds: [graphId],
          sagaId,
        }),
      )
    ).reverse();

    const unsummarized = newEpisodes.filter((ep) => ep.validAt > referenceTime);

    if (unsummarized.length === 0) {
      return {
        summary: saga.summary,
        metrics: { ...baseMetrics, 'episodes.unsummarized': 0 },
      };
    }

    const messages = buildSummarizeSagasMessages({
      sagaName: saga.name,
      existingSummary: saga.summary,
      newEpisodes: unsummarized,
    });

    const result = await model
      .withStructuredOutput(sagaSummaryJsonSchema)
      .invoke(messages, {
        callbacks: this.llmTracer.getCallbacks(ctx),
        runName: 'summarize-saga',
        tags: ['knowledge-graph', 'saga.summary'],
      });

    const updatedSaga = {
      ...saga,
      summary: result.summary,
      lastSummarizedAt: new Date(),
    };
    await this.sagaNodeRepository.save(updatedSaga);

    return {
      summary: updatedSaga.summary,
      metrics: { ...baseMetrics, 'episodes.unsummarized': unsummarized.length },
    };
  }

  async addEpisodes(options: AddEpisodeOptionsInput): Promise<AddEpisodeResult[]> {
    const parsed: AddEpisodeOptions = AddEpisodeOptionsSchema.parse(options);
    const uniqueGraphIds = [...new Set(parsed.episodes.map((e) => e.graphId))];

    const ctx: LlmContext = {
      userId: parsed.userId,
      sessionId: parsed.userId,
      tags: [
        'knowledge-graph',
        'ingestion',
        ...uniqueGraphIds.map((id) => `graph:${id}`),
      ],
      metadata: {
        episodeCount: String(parsed.episodes.length),
      },
    };

    const { results } = await this.addEpisodesImpl(parsed, ctx);
    return results;
  }

  @Span('addEpisodes', { onResult: metricsOnResult })
  private async addEpisodesImpl(
    parsed: AddEpisodeOptions,
    ctx: LlmContext,
  ): Promise<{ results: AddEpisodeResult[]; metrics: SpanMetrics }> {
    const startMs = performance.now();
    const {
      userId,
      episodes,
      entityTypes,
      edgeTypes,
      edgeTypeMappings,
      excludedEntityTypes,
      customInstructions,
      updateCommunities,
    } = parsed;

    const effectiveEdgeTypeMappings = getEffectiveTypeMappings(
      edgeTypeMappings,
      edgeTypes,
    );
    const model = await this.llmService.getActiveModel(userId);

    // 2. Retrieve previous episodes in parallel
    // TODO: upstream's singular `add_episode` filters previous episodes by
    // source (graphiti.py:1045 - `source=source`). Upstream's bulk path doesn't.
    // We took the bulk semantics; revisit if same-source context proves to
    // matter for extraction quality.
    const prevEpisodesPerEpisode = await Promise.all(
      episodes.map((ep) =>
        this.episodicNodeRepository.retrieveEpisodes(
          RetrieveEpisodesParamsSchema.parse({
            referenceTime: ep.referenceTime,
            lastN: PREVIOUS_EPISODES_WINDOW,
            graphIds: [ep.graphId],
          }),
        ),
      ),
    );

    // 3. Create + save episodic nodes (apply id override if provided)
    const episodicNodes = episodes.map((raw) => {
      const node = createEpisodicNode({
        name: raw.name,
        content: raw.content,
        source: raw.source,
        sourceDescription: raw.sourceDescription,
        graphId: raw.graphId,
        validAt: raw.referenceTime,
      });
      return raw.id ? { ...node, id: raw.id } : node;
    });
    await this.episodicNodeRepository.saveBulk(episodicNodes);

    // 4. Extract nodes in parallel. Edges are extracted later in step 11.
    const extractedNodesPerEpisode = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      episodicNodes.map((ep, i) => async () => {
        const { extractedNodes } = await this.extractNodes(
          model,
          ep,
          prevEpisodesPerEpisode[i],
          entityTypes,
          customInstructions,
          excludedEntityTypes,
          { ...ctx, metadata: { ...ctx.metadata, episodeId: ep.id } },
        );
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
    const graphIds = [...new Set(episodes.map((e) => e.graphId))];
    const candidatesPerEpisode = await Promise.all(
      embeddedPerEpisode.map((nodes, i) =>
        this.collectNodeCandidates(nodes, episodicNodes[i].graphId),
      ),
    );
    const existingNodesMap = new Map(candidatesPerEpisode.flat().map((n) => [n.id, n]));

    // 7. Pass 1 - resolve nodes vs live graph in parallel
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
            {
              ...ctx,
              metadata: { ...ctx.metadata, episodeId: episodicNodes[i].id },
            },
          ),
      ),
    );

    // 8. Merge duplicate pairs from pass 1
    const pass1Pairs: [Uuid, Uuid][] = nodeResolutions.flatMap((r) =>
      r.duplicatePairs.map((p): [Uuid, Uuid] => [p.extractedId, p.canonicalId]),
    );

    // 9. Pass 2 - within-batch dedup. The canonical pool is seeded with
    // matched-existing nodes from pass 1 so a new node Y in episode B can be
    // collapsed onto existing X even when X wasn't in B's own candidate set
    // (it was surfaced only by episode A's search). Without this, Y would
    // silently persist as a duplicate row alongside X. Mirrors upstream
    // `dedupe_nodes_bulk` (bulk_utils.py:414). New-vs-new keeps first-seen
    // as canonical.
    const allNewNodes = nodeResolutions.flatMap((r) => r.resolvedNodes);
    const matchedExistingIds = new Set(
      nodeResolutions.flatMap((r) => r.duplicatePairs.map((p) => p.canonicalId)),
    );
    const matchedExistingNodes = [...matchedExistingIds]
      .map((id) => existingNodesMap.get(id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined);

    const isDuplicateNode = (a: EntityNode, b: EntityNode): boolean => {
      if (normalizeString(a.name) === normalizeString(b.name)) return true;
      return (
        a.nameEmbedding !== null &&
        b.nameEmbedding !== null &&
        cosineSimilarity(a.nameEmbedding, b.nameEmbedding) >= COSINE_SIMILARITY_THRESHOLD
      );
    };

    const pass2Pairs: [Uuid, Uuid][] = [];
    const canonicalPool: EntityNode[] = [...matchedExistingNodes];
    for (const newNode of allNewNodes) {
      const match = canonicalPool.find((c) => isDuplicateNode(newNode, c));
      if (match) {
        pass2Pairs.push([newNode.id, match.id]);
      } else {
        canonicalPool.push(newNode);
      }
    }

    const finalIdMap = buildDirectedIdMap([...pass1Pairs, ...pass2Pairs]);

    // 10. Determine canonical nodes per episode
    const canonicalNodesPerEpisode = nodeResolutions.map((resolution) => {
      const ownCanonical = resolution.resolvedNodes.filter(
        (n) => (finalIdMap.get(n.id) ?? n.id) === n.id,
      );
      const matchedExisting = resolution.duplicatePairs
        .map((p) => {
          const canonical = finalIdMap.get(p.canonicalId) ?? p.canonicalId;
          return existingNodesMap.get(canonical);
        })
        .filter((n): n is NonNullable<typeof n> => n !== undefined);

      const seen = new Set<Uuid>();
      return [...ownCanonical, ...matchedExisting].filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      });
    });

    // 11. Extract edges in parallel using the canonical nodes resolved above,
    // then resolve pointers.
    const rawEdgesPerEpisode = await withConcurrency(
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
            { ...ctx, metadata: { ...ctx.metadata, episodeId: ep.id } },
          ),
      ),
    );

    const pointedEdgesPerEpisode = rawEdgesPerEpisode.map((edges) =>
      resolveEdgePointers(edges, finalIdMap),
    );

    // 12. Embed all extracted edges (batch)
    const allExtractedEdges = pointedEdgesPerEpisode.flat();
    const allEmbeddedEdges = await this.embeddingService.embedEdges(allExtractedEdges);
    const embeddedEdgesPerEpisode = reassembleByOffsets(
      allEmbeddedEdges,
      pointedEdgesPerEpisode.map((a) => a.length),
    );

    // 13. Cross-batch edge dedup. Without this, two batch episodes that mention
    // the same fact would each be resolved against the live graph independently
    // and both persist as separate rows. Mirrors upstream `dedupe_edges_bulk`.
    const dedupedEdgesPerEpisode = await this.edgeResolutionService.dedupeAcrossBatch(
      model,
      embeddedEdgesPerEpisode,
      episodicNodes,
      prevEpisodesPerEpisode,
      customInstructions,
      ctx,
    );

    // 14. Collect search-based edge candidates per episode
    const edgeCandidatesPerEpisode = await Promise.all(
      dedupedEdgesPerEpisode.map((edges, i) =>
        this.collectEdgeCandidates(edges, episodicNodes[i].graphId),
      ),
    );

    // 15. Resolve edges in parallel
    const edgeResolutions = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      episodicNodes.map(
        (ep, i) => () =>
          this.edgeResolutionService.resolveEdges(
            model,
            ep,
            dedupedEdgesPerEpisode[i],
            edgeCandidatesPerEpisode[i],
            finalIdMap,
            ep.validAt,
            prevEpisodesPerEpisode[i],
            customInstructions,
            { ...ctx, metadata: { ...ctx.metadata, episodeId: ep.id } },
          ),
      ),
    );

    const allResolvedEdges = edgeResolutions.flatMap((r) => r.resolvedEdges);
    const allInvalidatedEdges = edgeResolutions.flatMap((r) => r.invalidatedEdges);
    // Freshly extracted edges (no existing duplicate). Attribute extraction
    // runs only over these so that re-matched existing edges aren't re-LLM'd
    // and don't get prior attributes overwritten by a thinner new episode.
    const allNewEdges = edgeResolutions.flatMap((r) => r.newEdges);

    // 16. Build per-node and per-edge episode context for the helpers below
    const allCanonicalNodes = [
      ...new Map(canonicalNodesPerEpisode.flat().map((n) => [n.id, n])).values(),
    ];
    const newNodesOnly = allCanonicalNodes.filter((n) => !existingNodesMap.has(n.id));

    const nodeContext = new Map<
      Uuid,
      { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }
    >();
    canonicalNodesPerEpisode.forEach((nodes, i) => {
      for (const n of nodes) {
        if (!nodeContext.has(n.id)) {
          nodeContext.set(n.id, {
            episode: episodicNodes[i],
            previousEpisodes: prevEpisodesPerEpisode[i],
          });
        }
      }
    });

    const edgeContext = new Map<Uuid, { referenceTime: Date }>();
    edgeResolutions.forEach((res, epIndex) => {
      for (const edge of res.resolvedEdges) {
        edgeContext.set(edge.id, { referenceTime: episodicNodes[epIndex].validAt });
      }
    });

    // 17. Fill edge attributes post-resolution (custom edge types). Only
    // new edges - existing duplicates already carry attributes from prior
    // ingestion and re-running risks overwriting them with thinner values.
    await this.fillEdgeAttributes(
      model,
      allNewEdges,
      allCanonicalNodes,
      edgeTypes,
      effectiveEdgeTypeMappings,
      edgeContext,
      ctx,
    );

    // 17a. Per-edge timestamp fallback: when the batch extraction prompt
    // returned null validAt/invalidAt, ask the LLM specifically about that
    // single fact. Mirrors graphiti's `_extract_edge_timestamps`.
    await this.extractEdgeTimestampsFallback(model, allNewEdges, edgeContext, ctx);

    // 18. Fill entity attributes post-resolution (with resolved-edge context).
    // Includes matched-existing nodes so attributes get refined from the new
    // episode's content instead of frozen at first mention. Mirrors upstream
    // `extract_attributes_from_nodes(... nodes ...)` which runs on the full
    // resolved set, not just new ones.
    await this.fillEntityAttributes(
      model,
      allCanonicalNodes,
      allResolvedEdges,
      entityTypes,
      nodeContext,
      ctx,
    );

    // 19. Generate / refine summaries for all canonical nodes (new + matched).
    // Matched nodes accumulate new facts from this episode into their summary.
    // Only new edges are passed as fact context - matched-existing edges already
    // contributed to the node's prior summary, so re-feeding them risks the LLM
    // re-emitting known facts. Mirrors upstream
    // `extract_attributes_from_nodes(..., edges=new_edges)`.
    await this.summarizeNodes(
      model,
      allCanonicalNodes,
      allNewEdges,
      entityTypes,
      nodeContext,
      ctx,
    );

    // 20. Re-embed canonical nodes renamed during dedup. Resolution rewrites
    // node.name and nulls nameEmbedding (stale vector) - if we don't refill
    // them here, those rows save with NULL embeddings and become invisible to
    // vector search until the next time they're touched.
    const renamedNodes = allCanonicalNodes.filter((n) => n.nameEmbedding === null);
    if (renamedNodes.length > 0) {
      const reembedded = await this.embeddingService.embedNodes(renamedNodes);
      const byId = new Map(reembedded.map((n) => [n.id, n]));

      for (let i = 0; i < allCanonicalNodes.length; i++) {
        const fresh = byId.get(allCanonicalNodes[i].id);
        if (fresh) allCanonicalNodes[i] = fresh;
      }
    }

    // 21. Create episodic edges per episode
    const episodicEdgesPerEpisode = episodicNodes.map((ep, i) =>
      canonicalNodesPerEpisode[i].map((node) =>
        createEpisodicEdge({
          sourceNodeId: ep.id,
          targetNodeId: node.id,
          graphId: ep.graphId,
        }),
      ),
    );
    const allEpisodicEdges = episodicEdgesPerEpisode.flat();

    // 22. Persist: nodes first, then edges. Postgres FK constraints reject
    // edges whose endpoints don't yet exist; Neo4j silently no-op'd these via
    // MATCH...MERGE, which masked the ordering bug.
    await Promise.all([
      this.entityNodeRepository.saveBulk(allCanonicalNodes),
      this.episodicNodeRepository.saveBulk(episodicNodes),
    ]);
    await Promise.all([
      this.entityEdgeRepository.saveBulk(allResolvedEdges),
      this.entityEdgeRepository.saveBulk(allInvalidatedEdges),
      this.episodicEdgeRepository.saveBulk(allEpisodicEdges),
    ]);

    // 23. Saga association: ensure each referenced saga exists, then write
    // HAS_EPISODE for every batch episode. Chronology lives in
    // `episodic_nodes.valid_at` (createdAt tiebreaker), so no NEXT_EPISODE
    // chain is needed - saga walks ORDER BY valid_at via retrieveEpisodes.
    const sagaGroups = new Map<Uuid, number[]>();
    for (let i = 0; i < episodes.length; i++) {
      const sagaId = episodes[i].sagaId;
      if (!sagaId) continue;
      sagaGroups.set(sagaId, [...(sagaGroups.get(sagaId) ?? []), i]);
    }

    for (const [sagaId, indices] of sagaGroups) {
      const graphId = episodes[indices[0]].graphId;

      // TODO: saga name defaults to the ID string. Plan: accept an optional
      // caller-provided name on AddEpisodeOptions, and otherwise let
      // summarizeSaga generate one alongside the summary (extend
      // sagaSummaryJsonSchema to return { name, summary }). Free naming pass
      // since summarizeSaga already runs an LLM call over saga episodes.
      await this.sagaNodeRepository.createIfNotExists(
        createSagaNode({
          id: sagaId,
          name: NodeNameSchema.parse(sagaId),
          graphId,
        }),
      );

      await Promise.all(
        indices.map((i) =>
          this.hasEpisodeEdgeRepository.save(
            createHasEpisodeEdge({
              sourceNodeId: sagaId,
              targetNodeId: episodicNodes[i].id,
              graphId: episodicNodes[i].graphId,
            }),
          ),
        ),
      );
    }

    // 24. Optional community build per distinct graphId
    // TODO: Concurrent addEpisodes calls for the same graphId can race here -
    // two community builds may project conflicting graph snapshots and race
    // on the per-graph community teardown/rebuild. Investigate a per-graphId
    // mutex or advisory lock before enabling concurrent bulk ingestion.
    if (updateCommunities) {
      await Promise.all(
        graphIds.map((gid) => this.communityService.buildCommunities(userId, gid)),
      );
    }

    // TODO: per-entry `nodes` includes both newly-resolved canonical nodes AND
    // existing nodes matched via cross-batch dedup. The same canonical EntityNode
    // may therefore appear in multiple entries' `nodes` arrays - callers must
    // dedupe by id if they want a unique set across the batch
    // (`result.flatMap(r => r.nodes)` will overcount). Consider returning a
    // separate top-level deduped `nodes` field if a unique-view is needed.
    const results = episodicNodes.map(
      (episode, i): AddEpisodeResult => ({
        episode,
        nodes: canonicalNodesPerEpisode[i],
        edges: edgeResolutions[i].resolvedEdges,
        invalidatedEdges: edgeResolutions[i].invalidatedEdges,
        episodicEdges: episodicEdgesPerEpisode[i],
      }),
    );

    return {
      results,
      metrics: {
        'user.id': ctx.userId,
        'session.id': ctx.sessionId ?? ctx.userId,
        'episode.count': episodes.length,
        'episode.ids': episodicNodes.map((e) => e.id).join(','),
        'graph.ids': graphIds.join(','),
        'node.count.extracted': allExtractedNodes.length,
        'node.count.canonical': allCanonicalNodes.length,
        'node.count.new': newNodesOnly.length,
        'edge.count.extracted': allExtractedEdges.length,
        'edge.count.resolved': allResolvedEdges.length,
        'edge.count.invalidated': allInvalidatedEdges.length,
        'edge.count.new': allNewEdges.length,
        'previousEpisodes.totalCount': prevEpisodesPerEpisode.reduce(
          (s, a) => s + a.length,
          0,
        ),
        updateCommunities: updateCommunities,
        duration_ms: Math.round(performance.now() - startMs),
      },
    };
  }

  private async extractNodes(
    model: BaseChatModel,
    episode: EpisodicNode,
    previousEpisodesForEpisode: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    customInstructions?: string,
    excludedEntityTypes?: string[],
    ctx?: LlmContext,
  ): Promise<{ extractedNodes: EntityNode[] }> {
    const { metrics: _m, ...rest } = await this.extractNodesImpl(
      model,
      episode,
      previousEpisodesForEpisode,
      entityTypes,
      customInstructions,
      excludedEntityTypes,
      ctx,
    );
    return rest;
  }

  @Span('extractNodes', { onResult: metricsOnResult })
  private async extractNodesImpl(
    model: BaseChatModel,
    episode: EpisodicNode,
    previousEpisodesForEpisode: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    customInstructions?: string,
    excludedEntityTypes?: string[],
    ctx?: LlmContext,
  ): Promise<{ extractedNodes: EntityNode[]; metrics: SpanMetrics }> {
    const baseMetrics: SpanMetrics = { 'episode.id': episode.id };

    let extractedNodes: EntityNode[];
    let chunksCount: number | undefined;

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
            ctx,
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
      chunksCount = chunks.length;
    } else {
      extractedNodes = await this.nodeExtractionService.extractNodes(
        model,
        episode,
        previousEpisodesForEpisode,
        entityTypes,
        customInstructions,
        excludedEntityTypes,
        ctx,
      );
    }

    return {
      extractedNodes,
      metrics: {
        ...baseMetrics,
        'extracted.count': extractedNodes.length,
        'chunks.count': chunksCount,
      },
    };
  }

  private async collectNodeCandidates(
    nodes: EntityNode[],
    graphId: Uuid,
  ): Promise<EntityNode[]> {
    const { candidates } = await this.collectNodeCandidatesImpl(nodes, graphId);
    return candidates;
  }

  @Span('collectNodeCandidates', {
    attributes: RETRIEVER_ATTRS,
    onResult: metricsOnResult,
  })
  private async collectNodeCandidatesImpl(
    nodes: EntityNode[],
    graphId: Uuid,
  ): Promise<{ candidates: EntityNode[]; metrics: SpanMetrics }> {
    const results = await Promise.all(
      nodes.flatMap((n) => [
        this.entityNodeRepository.searchByName(
          SearchByTextParamsSchema.parse({
            query: n.name,
            graphIds: [graphId],
            limit: CANDIDATE_LIMIT,
          }),
        ),
        n.nameEmbedding !== null
          ? this.entityNodeRepository.searchBySimilarity(
              SearchBySimilarityParamsSchema.parse({
                embedding: n.nameEmbedding,
                graphIds: [graphId],
                limit: CANDIDATE_LIMIT,
              }),
            )
          : Promise.resolve([] as EntityNode[]),
      ]),
    );
    const seen = new Set<Uuid>();
    const candidates = results.flat().filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
    return {
      candidates,
      metrics: {
        'input.count': nodes.length,
        'graph.id': graphId,
        'candidates.count': candidates.length,
      },
    };
  }

  private async collectEdgeCandidates(
    edges: EntityEdge[],
    graphId: Uuid,
  ): Promise<EntityEdge[]> {
    const { candidates } = await this.collectEdgeCandidatesImpl(edges, graphId);
    return candidates;
  }

  @Span('collectEdgeCandidates', {
    attributes: RETRIEVER_ATTRS,
    onResult: metricsOnResult,
  })
  private async collectEdgeCandidatesImpl(
    edges: EntityEdge[],
    graphId: Uuid,
  ): Promise<{ candidates: EntityEdge[]; metrics: SpanMetrics }> {
    // Same-endpoint edges (`getBetweenNodes`) are fetched explicitly per edge:
    // text + similarity searches may not surface an existing edge whose fact
    // differs textually from the new one, but a duplicate or contradiction
    // between the same two nodes still needs to be considered during dedup.
    // Mirrors upstream `EntityEdge.get_between_nodes` in edge_operations.py.
    const results = await Promise.all(
      edges.flatMap((e) => [
        this.entityEdgeRepository.searchByFact(
          SearchByTextParamsSchema.parse({
            query: e.fact,
            graphIds: [graphId],
            limit: CANDIDATE_LIMIT,
          }),
        ),
        e.factEmbedding !== null
          ? this.entityEdgeRepository.searchBySimilarity(
              SearchBySimilarityParamsSchema.parse({
                embedding: e.factEmbedding,
                graphIds: [graphId],
                limit: CANDIDATE_LIMIT,
              }),
            )
          : Promise.resolve([] as EntityEdge[]),
        this.entityEdgeRepository.getBetweenNodes(e.sourceNodeId, e.targetNodeId),
      ]),
    );
    const seen = new Set<Uuid>();
    const candidates = results.flat().filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    return {
      candidates,
      metrics: {
        'input.count': edges.length,
        'graph.id': graphId,
        'candidates.count': candidates.length,
      },
    };
  }

  private async summarizeNodes(
    model: BaseChatModel,
    nodes: EntityNode[],
    allEdges: EntityEdge[],
    entityTypes: EntityTypeMap | undefined,
    nodeContext: Map<Uuid, { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }>,
    ctx?: LlmContext,
  ): Promise<void> {
    await this.summarizeNodesImpl(model, nodes, allEdges, entityTypes, nodeContext, ctx);
  }

  @Span('summarizeNodes', { onResult: metricsOnResult })
  private async summarizeNodesImpl(
    model: BaseChatModel,
    nodes: EntityNode[],
    allEdges: EntityEdge[],
    entityTypes: EntityTypeMap | undefined,
    nodeContext: Map<Uuid, { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }>,
    ctx?: LlmContext,
  ): Promise<{ metrics: SpanMetrics }> {
    if (nodes.length === 0) {
      return { metrics: { 'nodes.count': 0, 'summarized.count': 0 } };
    }

    // Group nodes by their originating episode so each node is summarized with its own context.
    const nodesByEpisode = new Map<
      Uuid,
      { episode: EpisodicNode; previousEpisodes: EpisodicNode[]; nodes: EntityNode[] }
    >();

    for (const node of nodes) {
      const nodeCtx = nodeContext.get(node.id);
      if (!nodeCtx) continue;
      const entry = nodesByEpisode.get(nodeCtx.episode.id);
      if (entry) {
        entry.nodes.push(node);
      } else {
        nodesByEpisode.set(nodeCtx.episode.id, {
          episode: nodeCtx.episode,
          previousEpisodes: nodeCtx.previousEpisodes,
          nodes: [node],
        });
      }
    }

    const entityTypeDescriptions: Record<string, string> = entityTypes
      ? Object.fromEntries(
          Object.entries(entityTypes).map(([label, { description }]) => [
            label,
            description,
          ]),
        )
      : {};

    const summaryMap = new Map<string, string>();
    for (const {
      episode,
      previousEpisodes,
      nodes: groupNodes,
    } of nodesByEpisode.values()) {
      const summaryInput = groupNodes.map((n) => {
        const label = n.labels.find((l) => l !== 'Entity');
        const type = label && entityTypes?.[label] ? label : undefined;
        return {
          name: n.name,
          type,
          existingSummary: n.summary,
          facts: allEdges
            .filter((e) => e.sourceNodeId === n.id || e.targetNodeId === n.id)
            .map((e) => e.fact),
        };
      });

      for (let i = 0; i < summaryInput.length; i += MAX_NODES_PER_SUMMARY_BATCH) {
        const batch = summaryInput.slice(i, i + MAX_NODES_PER_SUMMARY_BATCH);
        const summaryMessages = buildNodeSummaryMessages({
          episode,
          previousEpisodes,
          nodes: batch,
          entityTypeDescriptions,
        });
        const summaryResult = await model
          .withStructuredOutput(nodeSummaryJsonSchema)
          .invoke(summaryMessages, {
            callbacks: this.llmTracer.getCallbacks(ctx),
            runName: 'summarize-nodes',
            tags: ['knowledge-graph', 'node.summary'],
          });
        for (const s of summaryResult.summaries) {
          summaryMap.set(normalizeString(s.name), s.summary);
        }
      }
    }

    for (const node of nodes) {
      const summary = summaryMap.get(normalizeString(node.name));
      if (summary !== undefined) node.summary = summary;
    }

    return {
      metrics: {
        'nodes.count': nodes.length,
        'summarized.count': summaryMap.size,
      },
    };
  }

  private async fillEntityAttributes(
    model: BaseChatModel,
    nodes: EntityNode[],
    allEdges: EntityEdge[],
    entityTypes: EntityTypeMap | undefined,
    nodeContext: Map<Uuid, { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }>,
    ctx?: LlmContext,
  ): Promise<void> {
    await this.fillEntityAttributesImpl(
      model,
      nodes,
      allEdges,
      entityTypes,
      nodeContext,
      ctx,
    );
  }

  @Span('fillEntityAttributes', { onResult: metricsOnResult })
  private async fillEntityAttributesImpl(
    model: BaseChatModel,
    nodes: EntityNode[],
    allEdges: EntityEdge[],
    entityTypes: EntityTypeMap | undefined,
    nodeContext: Map<Uuid, { episode: EpisodicNode; previousEpisodes: EpisodicNode[] }>,
    ctx?: LlmContext,
  ): Promise<{ metrics: SpanMetrics }> {
    const baseMetrics: SpanMetrics = {
      'nodes.count': nodes.length,
      'entityTypes.count': entityTypes ? Object.keys(entityTypes).length : 0,
    };
    if (!entityTypes) return { metrics: { ...baseMetrics, 'extracted.count': 0 } };
    let extracted = 0;

    for (const node of nodes) {
      const label = node.labels.find((l) => l !== 'Entity');
      const entityType = label ? entityTypes[label] : undefined;
      if (!entityType) continue;

      const nodeCtx = nodeContext.get(node.id);
      if (!nodeCtx) continue;
      const nodeEdges = allEdges.filter(
        (e) => e.sourceNodeId === node.id || e.targetNodeId === node.id,
      );
      const attrMessages = buildFillEntityAttributesMessages({
        entityName: node.name,
        episodeContent: nodeCtx.episode.content,
        previousEpisodesContent: nodeCtx.previousEpisodes.map((ep) => ep.content),
        relatedFacts: nodeEdges.map((e) => e.fact),
        referenceTime: nodeCtx.episode.validAt,
        existingAttributes: node.attributes ?? {},
      });
      const attrs = await model
        .withStructuredOutput(z.toJSONSchema(entityType.schema, { io: 'input' }))
        .invoke(attrMessages, {
          callbacks: this.llmTracer.getCallbacks(ctx),
          runName: 'fill-entity-attributes',
          tags: ['knowledge-graph', 'attributes.entity'],
        });
      node.attributes = { ...node.attributes, ...attrs };
      extracted++;
    }
    return { metrics: { ...baseMetrics, 'extracted.count': extracted } };
  }

  private async fillEdgeAttributes(
    model: BaseChatModel,
    resolvedEdges: EntityEdge[],
    canonicalNodes: EntityNode[],
    edgeTypes: EdgeTypeMap | undefined,
    edgeTypeMappings: EdgeTypeMappings | undefined,
    edgeContext: Map<Uuid, { referenceTime: Date }>,
    ctx?: LlmContext,
  ): Promise<void> {
    await this.fillEdgeAttributesImpl(
      model,
      resolvedEdges,
      canonicalNodes,
      edgeTypes,
      edgeTypeMappings,
      edgeContext,
      ctx,
    );
  }

  @Span('fillEdgeAttributes', { onResult: metricsOnResult })
  private async fillEdgeAttributesImpl(
    model: BaseChatModel,
    resolvedEdges: EntityEdge[],
    canonicalNodes: EntityNode[],
    edgeTypes: EdgeTypeMap | undefined,
    edgeTypeMappings: EdgeTypeMappings | undefined,
    edgeContext: Map<Uuid, { referenceTime: Date }>,
    ctx?: LlmContext,
  ): Promise<{ metrics: SpanMetrics }> {
    const baseMetrics: SpanMetrics = {
      'edges.count': resolvedEdges.length,
      'edgeTypes.count': edgeTypes ? Object.keys(edgeTypes).length : 0,
    };

    if (!edgeTypes || !edgeTypeMappings) {
      return { metrics: { ...baseMetrics, 'extracted.count': 0 } };
    }
    const idToNode = new Map<Uuid, EntityNode>(canonicalNodes.map((n) => [n.id, n]));

    type EdgeAttrTask = {
      edge: EntityEdge;
      jsonSchema: { properties?: Record<string, unknown> };
      referenceTime: Date;
    };
    const tasks: EdgeAttrTask[] = [];
    for (const edge of resolvedEdges) {
      const src = idToNode.get(edge.sourceNodeId);
      const tgt = idToNode.get(edge.targetNodeId);
      if (!src || !tgt) continue;
      const applicable = getApplicableEdgeTypes(
        src.labels,
        tgt.labels,
        edgeTypes,
        edgeTypeMappings,
      );
      const typeDef = applicable[edge.name];
      if (!typeDef) continue;
      const jsonSchema = z.toJSONSchema(typeDef.schema, { io: 'input' }) as {
        properties?: Record<string, unknown>;
      };
      if (Object.keys(jsonSchema.properties ?? {}).length === 0) continue;
      const edgeCtx = edgeContext.get(edge.id);
      if (!edgeCtx) continue;
      tasks.push({ edge, jsonSchema, referenceTime: edgeCtx.referenceTime });
    }

    await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      tasks.map(({ edge, jsonSchema, referenceTime }) => async () => {
        const attrs = (await model.withStructuredOutput(jsonSchema).invoke(
          buildFillEdgeAttributesMessages({
            fact: edge.fact,
            referenceTime,
            existingAttributes: edge.attributes ?? {},
          }),
          {
            callbacks: this.llmTracer.getCallbacks(ctx),
            runName: 'fill-edge-attributes',
            tags: ['knowledge-graph', 'attributes.edge'],
          },
        )) as Record<string, unknown>;
        edge.attributes = { ...edge.attributes, ...attrs };
      }),
    );
    return { metrics: { ...baseMetrics, 'extracted.count': tasks.length } };
  }

  // Per-edge fallback: when the batch extraction prompt leaves an edge with
  // both validAt and invalidAt null, ask the LLM specifically for the temporal
  // window of that single fact. Mirrors graphiti's `_extract_edge_timestamps`
  // (edge_operations.py:576).
  @Span('extractEdgeTimestampsFallback', { onResult: metricsOnResult })
  private async extractEdgeTimestampsFallback(
    model: BaseChatModel,
    edges: EntityEdge[],
    edgeContext: Map<Uuid, { referenceTime: Date }>,
    ctx?: LlmContext,
  ): Promise<{ metrics: SpanMetrics }> {
    const candidates = edges.filter(
      (e) => e.validAt === null && e.invalidAt === null && edgeContext.has(e.id),
    );

    await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      candidates.map((edge) => async () => {
        const referenceTime = edgeContext.get(edge.id)!.referenceTime;
        const result = await model
          .withStructuredOutput(edgeTimestampsJsonSchema)
          .invoke(buildExtractTimestampsMessages({ fact: edge.fact, referenceTime }), {
            callbacks: this.llmTracer.getCallbacks(ctx),
            runName: 'extract-edge-timestamps-fallback',
            tags: ['knowledge-graph', 'timestamps.edge.fallback'],
          });

        if (result.validAt) {
          const d = new Date(result.validAt);
          if (!Number.isNaN(d.getTime())) edge.validAt = d;
        }
        if (result.invalidAt) {
          const d = new Date(result.invalidAt);
          if (!Number.isNaN(d.getTime())) edge.invalidAt = d;
        }
      }),
    );

    return {
      metrics: { 'edges.count': edges.length, 'candidates.count': candidates.length },
    };
  }
}
