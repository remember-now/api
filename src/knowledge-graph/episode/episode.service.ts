import { Inject, Injectable } from '@nestjs/common';

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

import {
  buildDirectedIdMap,
  LLM_CONCURRENCY_LIMIT,
  reassembleByOffsets,
  resolveEdgePointers,
  withConcurrency,
} from '../batch-utils';
import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import { invokeStructured } from '../llm';
import {
  createEpisodicEdge,
  createEpisodicNode,
  createHasEpisodeEdge,
  createSagaNode,
  EpisodicNode,
} from '../models';
import { buildSummarizeSagasMessages, SagaSummarySchema } from '../prompts';
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
  EpisodeType,
  NodeNameSchema,
  RetrieveEpisodesParamsInput,
  RetrieveEpisodesParamsSchema,
} from '../types';
import { getEffectiveTypeMappings } from './episode-utils';
import {
  AddEpisodeResult,
  AddJsonEpisodesOptionsInput,
  AddJsonEpisodesOptionsSchema,
  AddMessageEpisodesOptionsInput,
  AddMessageEpisodesOptionsSchema,
  AddTextEpisodesOptionsInput,
  AddTextEpisodesOptionsSchema,
  NormalizedAddEpisodeOptions,
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
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly entityEdgeRepository: EntityEdgeRepository,
    private readonly episodicNodeRepository: EpisodicNodeRepository,
    private readonly episodicEdgeRepository: EpisodicEdgeRepository,
    private readonly sagaNodeRepository: SagaNodeRepository,
    private readonly hasEpisodeEdgeRepository: HasEpisodeEdgeRepository,
    @Inject(LLM_TRACER) private readonly llmTracer: LlmTracer,
  ) {}

  private static makeCtx(parsed: NormalizedAddEpisodeOptions): LlmContext {
    const uniqueGraphIds = [...new Set(parsed.episodes.map((e) => e.graphId))];
    return {
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
  }

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
    const result = await invokeStructured(model, SagaSummarySchema, messages, {
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

  async addTextEpisodes(
    options: AddTextEpisodesOptionsInput,
  ): Promise<AddEpisodeResult[]> {
    const parsed = AddTextEpisodesOptionsSchema.parse(options);
    const normalized: NormalizedAddEpisodeOptions = {
      ...parsed,
      episodes: parsed.episodes.map((ep) => ({
        ...ep,
        source: EpisodeType.text,
        referenceTime: new Date(ep.referenceTime),
      })),
    };
    const { results } = await this.addEpisodesImpl(
      normalized,
      EpisodeService.makeCtx(normalized),
    );
    return results;
  }

  async addMessageEpisodes(
    options: AddMessageEpisodesOptionsInput,
  ): Promise<AddEpisodeResult[]> {
    const parsed = AddMessageEpisodesOptionsSchema.parse(options);
    const normalized: NormalizedAddEpisodeOptions = {
      ...parsed,
      episodes: parsed.episodes.map((ep) => ({
        ...ep,
        source: EpisodeType.message,
        referenceTime: new Date(ep.referenceTime),
        content: ep.content.map((t) => `${t.speakerName}: ${t.message}`).join('\n'),
      })),
    };
    const { results } = await this.addEpisodesImpl(
      normalized,
      EpisodeService.makeCtx(normalized),
    );
    return results;
  }

  async addJsonEpisodes(
    options: AddJsonEpisodesOptionsInput,
  ): Promise<AddEpisodeResult[]> {
    const parsed = AddJsonEpisodesOptionsSchema.parse(options);
    const normalized: NormalizedAddEpisodeOptions = {
      ...parsed,
      episodes: parsed.episodes.map((ep) => ({
        ...ep,
        source: EpisodeType.json,
        referenceTime: new Date(ep.referenceTime),
      })),
    };
    const { results } = await this.addEpisodesImpl(
      normalized,
      EpisodeService.makeCtx(normalized),
    );
    return results;
  }

  @Span('addEpisodes', { onResult: metricsOnResult })
  private async addEpisodesImpl(
    parsed: NormalizedAddEpisodeOptions,
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

    // 4. Extract nodes in parallel (chunking + per-chunk LLM + dedup-by-name
    // are owned by NodeExtractionService). Edges are extracted later in step 11.
    const extractedNodesPerEpisode = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      episodicNodes.map(
        (ep, i) => () =>
          this.nodeExtractionService.extractNodes(
            model,
            ep,
            prevEpisodesPerEpisode[i],
            entityTypes,
            customInstructions,
            excludedEntityTypes,
            { ...ctx, metadata: { ...ctx.metadata, episodeId: ep.id } },
          ),
      ),
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
        this.nodeResolutionService.collectCandidates(nodes, episodicNodes[i].graphId),
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

    // 9. Pass 2 - within-batch dedup. Owned by NodeResolutionService; canonical
    // pool is seeded with matched-existing nodes so a new node Y can collapse
    // onto existing X even when X wasn't in Y's own candidate set.
    const allNewNodes = nodeResolutions.flatMap((r) => r.resolvedNodes);
    const matchedExistingIds = new Set(
      nodeResolutions.flatMap((r) => r.duplicatePairs.map((p) => p.canonicalId)),
    );
    const matchedExistingNodes = [...matchedExistingIds]
      .map((id) => existingNodesMap.get(id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined);
    const pass2Pairs = this.nodeResolutionService.dedupeAcrossBatch(
      allNewNodes,
      matchedExistingNodes,
    );

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
        this.edgeResolutionService.collectCandidates(edges, episodicNodes[i].graphId),
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
    await this.edgeExtractionService.fillEdgeAttributes(
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
    await this.edgeExtractionService.extractEdgeTimestampsFallback(
      model,
      allNewEdges,
      edgeContext,
      ctx,
    );

    // 18. Fill entity attributes post-resolution (with resolved-edge context).
    // Includes matched-existing nodes so attributes get refined from the new
    // episode's content instead of frozen at first mention. Mirrors upstream
    // `extract_attributes_from_nodes(... nodes ...)` which runs on the full
    // resolved set, not just new ones.
    await this.nodeExtractionService.fillEntityAttributes(
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
    await this.nodeExtractionService.summarizeNodes(
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
}
