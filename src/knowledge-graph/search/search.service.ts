import { BaseChatModel } from '@langchain/core/language_models/chat_models';
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

import { EmbeddingService } from '../embedding';
import { CommunityNode, EntityEdge, EntityNode, EpisodicNode } from '../models';
import {
  CommunityNodeRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicNodeRepository,
} from '../repository/repositories';
import {
  SearchByBfsParamsSchema,
  SearchBySimilarityParamsSchema,
  SearchByTextParamsSchema,
} from '../types';
import {
  crossEncoderReranker,
  episodeMentionsReranker,
  mmr,
  nodeDistanceReranker,
  rrf,
} from './search-utils';
import {
  CommunityReranker,
  CommunitySearchConfig,
  CommunitySearchMethod,
  EdgeReranker,
  EdgeSearchConfig,
  EdgeSearchMethod,
  emptySearchResults,
  EpisodeReranker,
  EpisodeSearchConfig,
  EpisodeSearchMethod,
  NodeReranker,
  NodeSearchConfig,
  NodeSearchMethod,
  SearchConfigInput,
  SearchFilters,
  SearchOptions,
  SearchOptionsInput,
  SearchOptionsSchema,
  SearchResults,
} from './types';

const RETRIEVER_ATTRS = { 'langfuse.observation.type': 'retriever' };

@Injectable()
export class SearchService {
  constructor(
    private readonly llmService: LlmService,
    private readonly embeddingService: EmbeddingService,
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly entityEdgeRepository: EntityEdgeRepository,
    private readonly episodicNodeRepository: EpisodicNodeRepository,
    private readonly communityNodeRepository: CommunityNodeRepository,
    @Inject(LLM_TRACER) private readonly llmTracer: LlmTracer,
  ) {}

  async searchFromNodes(options: {
    nodeIds: Uuid[];
    query: string;
    graphIds: Uuid[];
    config: SearchConfigInput;
    userId: Uuid;
    filters?: SearchFilters;
  }): Promise<SearchResults> {
    return this.search({
      query: options.query,
      graphIds: options.graphIds,
      config: options.config,
      userId: options.userId,
      filters: options.filters,
      originNodeIds: options.nodeIds,
      centerNodeId: options.nodeIds[0],
    });
  }

  async search(options: SearchOptionsInput): Promise<SearchResults> {
    const { metrics: _m, ...rest } = await this.searchImpl(options);
    return rest;
  }

  @Span('search', { onResult: metricsOnResult })
  private async searchImpl(
    options: SearchOptionsInput,
  ): Promise<SearchResults & { metrics: SpanMetrics }> {
    const parsed: SearchOptions = SearchOptionsSchema.parse(options);
    const ctx: LlmContext = {
      userId: parsed.userId,
      sessionId: parsed.userId,
      tags: [
        'knowledge-graph',
        'retrieval',
        ...parsed.graphIds.map((id) => `group:${id}`),
      ],
      metadata: {
        query: parsed.query.slice(0, 200),
      },
    };

    const { query, graphIds, config, filters, centerNodeId, originNodeIds, userId } =
      parsed;

    const baseMetrics: SpanMetrics = {
      'user.id': ctx.userId,
      'session.id': ctx.sessionId ?? ctx.userId,
      'query.length': query.length,
    };

    if (!query.trim()) {
      return {
        ...emptySearchResults(),
        metrics: {
          ...baseMetrics,
          'results.edges': 0,
          'results.nodes': 0,
          'results.episodes': 0,
          'results.communities': 0,
        },
      };
    }

    const limit = config.limit;
    const minScore = config.rerankerMinScore;

    const configs = [
      config.edgeConfig,
      config.nodeConfig,
      config.episodeConfig,
      config.communityConfig,
    ].filter(Boolean);

    const needsVector = configs.some(
      (c) =>
        c!.searchMethods.some(
          (m) =>
            m === EdgeSearchMethod.cosine_similarity ||
            m === NodeSearchMethod.cosine_similarity ||
            m === CommunitySearchMethod.cosine_similarity,
        ) ||
        c!.reranker === EdgeReranker.mmr ||
        c!.reranker === NodeReranker.mmr ||
        c!.reranker === CommunityReranker.mmr,
    );

    const needsModel = configs.some(
      (c) =>
        c!.reranker === EdgeReranker.cross_encoder ||
        c!.reranker === NodeReranker.cross_encoder ||
        c!.reranker === EpisodeReranker.cross_encoder ||
        c!.reranker === CommunityReranker.cross_encoder,
    );

    const [queryVector, model] = await Promise.all([
      needsVector ? this.embeddingService.embedText(query) : Promise.resolve(null),
      needsModel ? this.llmService.getActiveModel(userId) : Promise.resolve(null),
    ]);

    const [edgeResult, nodeResult, episodeResult, communityResult] = await Promise.all([
      config.edgeConfig
        ? this.edgeSearch(
            query,
            queryVector,
            graphIds,
            config.edgeConfig,
            filters,
            limit,
            minScore,
            model,
            centerNodeId,
            originNodeIds,
            ctx,
          )
        : Promise.resolve([[], []] as [EntityEdge[], number[]]),
      config.nodeConfig
        ? this.nodeSearch(
            query,
            queryVector,
            graphIds,
            config.nodeConfig,
            filters,
            limit,
            minScore,
            model,
            centerNodeId,
            originNodeIds,
            ctx,
          )
        : Promise.resolve([[], []] as [EntityNode[], number[]]),
      config.episodeConfig
        ? this.episodeSearch(
            query,
            graphIds,
            config.episodeConfig,
            limit,
            minScore,
            model,
            ctx,
          )
        : Promise.resolve([[], []] as [EpisodicNode[], number[]]),
      config.communityConfig
        ? this.communitySearch(
            query,
            queryVector,
            graphIds,
            config.communityConfig,
            limit,
            minScore,
            model,
            ctx,
          )
        : Promise.resolve([[], []] as [CommunityNode[], number[]]),
    ]);

    const [edges, edgeScoreArr] = edgeResult;
    const [nodes, nodeScoreArr] = nodeResult;
    const [episodes, episodeScoreArr] = episodeResult;
    const [communities, communityScoreArr] = communityResult;

    return {
      edges,
      edgeScores: new Map(edges.map((e, i) => [e.id, edgeScoreArr[i]])),
      nodes,
      nodeScores: new Map(nodes.map((n, i) => [n.id, nodeScoreArr[i]])),
      episodes,
      episodeScores: new Map(episodes.map((ep, i) => [ep.id, episodeScoreArr[i]])),
      communities,
      communityScores: new Map(communities.map((c, i) => [c.id, communityScoreArr[i]])),
      metrics: {
        ...baseMetrics,
        'results.edges': edges.length,
        'results.nodes': nodes.length,
        'results.episodes': episodes.length,
        'results.communities': communities.length,
      },
    };
  }

  // ─── Edge search ───────────────────────────────────────────────────────────

  private async edgeSearch(
    query: string,
    queryVector: number[] | null,
    graphIds: Uuid[],
    config: EdgeSearchConfig,
    filters: SearchFilters | undefined,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    centerNodeId?: Uuid,
    originNodeIds?: Uuid[],
    ctx?: LlmContext,
  ): Promise<[EntityEdge[], number[]]> {
    const { edges, scores } = await this.edgeSearchImpl(
      query,
      queryVector,
      graphIds,
      config,
      filters,
      limit,
      minScore,
      model,
      centerNodeId,
      originNodeIds,
      ctx,
    );
    return [edges, scores];
  }

  @Span('search.edge', { attributes: RETRIEVER_ATTRS, onResult: metricsOnResult })
  private async edgeSearchImpl(
    query: string,
    queryVector: number[] | null,
    graphIds: Uuid[],
    config: EdgeSearchConfig,
    filters: SearchFilters | undefined,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    centerNodeId?: Uuid,
    originNodeIds?: Uuid[],
    ctx?: LlmContext,
  ): Promise<{ edges: EntityEdge[]; scores: number[]; metrics: SpanMetrics }> {
    const fetch = 2 * limit;
    const edgeMap = new Map<Uuid, EntityEdge>();

    const bm25Ids: Uuid[] = [];
    const cosineIds: Uuid[] = [];
    let bfsIds: Uuid[] = [];

    const tasks: Promise<void>[] = [];

    if (config.searchMethods.includes(EdgeSearchMethod.bm25)) {
      tasks.push(
        this.entityEdgeRepository
          .searchByFact(SearchByTextParamsSchema.parse({ query, graphIds, limit: fetch }))
          .then((edges) => {
            for (const e of edges) edgeMap.set(e.id, e);
            bm25Ids.push(...edges.map((e) => e.id));
          }),
      );
    }

    if (
      config.searchMethods.includes(EdgeSearchMethod.cosine_similarity) &&
      queryVector
    ) {
      tasks.push(
        this.entityEdgeRepository
          .searchBySimilarity(
            SearchBySimilarityParamsSchema.parse({
              embedding: queryVector,
              graphIds,
              limit: fetch,
              minScore: config.simMinScore,
            }),
            filters,
          )
          .then((edges) => {
            for (const e of edges) edgeMap.set(e.id, e);
            cosineIds.push(...edges.map((e) => e.id));
          }),
      );
    }

    await Promise.all(tasks);

    if (config.searchMethods.includes(EdgeSearchMethod.bfs)) {
      const origins =
        originNodeIds && originNodeIds.length > 0
          ? originNodeIds
          : [...edgeMap.values()].map((e) => e.sourceNodeId);

      if (origins.length > 0) {
        const bfsEdges = await this.entityEdgeRepository.searchByBfs(
          SearchByBfsParamsSchema.parse({
            originNodeIds: origins,
            graphIds,
            limit: fetch,
            maxDepth: config.maxDepth,
          }),
          filters,
        );
        for (const e of bfsEdges) edgeMap.set(e.id, e);
        bfsIds = bfsEdges.map((e) => e.id);
      }
    }

    const reranker = config.reranker;
    const rerankerMin = config.rerankerMinScore ?? minScore;

    let rankedIds: Uuid[];
    let rankedScores: number[];

    if (reranker === EdgeReranker.rrf) {
      [rankedIds, rankedScores] = rrf(
        [bm25Ids, cosineIds, bfsIds].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else if (reranker === EdgeReranker.mmr && queryVector) {
      const vectorPairs = new Map<Uuid, number[]>();
      for (const [id, edge] of edgeMap) {
        if (edge.factEmbedding) vectorPairs.set(id, edge.factEmbedding);
      }
      [rankedIds, rankedScores] = mmr(
        queryVector,
        vectorPairs,
        config.mmrLambda,
        rerankerMin,
      );
    } else if (reranker === EdgeReranker.cross_encoder && model) {
      const candidates = [...edgeMap.values()].slice(0, limit);
      [rankedIds, rankedScores] = await crossEncoderReranker(
        model,
        query,
        candidates.map((e) => ({ id: e.id, text: e.fact })),
        rerankerMin,
        { llmTracer: this.llmTracer, ctx },
      );
    } else if (reranker === EdgeReranker.node_distance) {
      if (!centerNodeId) {
        throw new Error('centerNodeId is required for node_distance reranker');
      }
      const sourceIds = [...new Set([...edgeMap.values()].map((e) => e.sourceNodeId))];
      const [rankedSourceIds, sourceScores] = await nodeDistanceReranker(
        this.entityNodeRepository,
        sourceIds,
        centerNodeId,
        rerankerMin,
      );
      // Map source IDs back to edge IDs (preserving order)
      const sourceScoreMap = new Map(rankedSourceIds.map((u, i) => [u, sourceScores[i]]));
      const edgeEntries: [Uuid, number][] = [];
      for (const [id, edge] of edgeMap) {
        const score = sourceScoreMap.get(edge.sourceNodeId);
        if (score !== undefined) edgeEntries.push([id, score]);
      }
      edgeEntries.sort((a, b) => b[1] - a[1]);
      rankedIds = edgeEntries.map(([u]) => u);
      rankedScores = edgeEntries.map(([, s]) => s);
    } else if (reranker === EdgeReranker.episode_mentions) {
      // RRF preliminary ranking, then sort by episode count descending.
      // Matches Python search.py:256-305: rrf runs first for both EdgeReranker.rrf
      // and EdgeReranker.episode_mentions, then episode_mentions applies the sort.
      const [rrfIds, rrfScores] = rrf(
        [bm25Ids, cosineIds, bfsIds].filter((l) => l.length > 0),
        rerankerMin,
      );
      const rrfScoreMap = new Map(rrfIds.map((u, i) => [u, rrfScores[i]]));
      const rrfEdges = rrfIds
        .map((id) => edgeMap.get(id))
        .filter((e): e is EntityEdge => e !== undefined);
      rrfEdges.sort((a, b) => b.episodes.length - a.episodes.length);
      rankedIds = rrfEdges.map((e) => e.id);
      rankedScores = rankedIds.map((u) => rrfScoreMap.get(u) ?? 0);
    } else {
      // Fallback: RRF
      [rankedIds, rankedScores] = rrf(
        [bm25Ids, cosineIds, bfsIds].filter((l) => l.length > 0),
        rerankerMin,
      );
    }

    const resultEdges = rankedIds
      .slice(0, limit)
      .map((id) => edgeMap.get(id))
      .filter((e): e is EntityEdge => e !== undefined);
    const resultScores = rankedScores.slice(0, limit).slice(0, resultEdges.length);

    return {
      edges: resultEdges,
      scores: resultScores,
      metrics: {
        'query.length': query.length,
        limit: limit,
        minScore: minScore,
        'config.searchMethods': config.searchMethods.join(','),
        'config.reranker': config.reranker,
        'result.count': resultEdges.length,
      },
    };
  }

  // ─── Node search ───────────────────────────────────────────────────────────

  private async nodeSearch(
    query: string,
    queryVector: number[] | null,
    graphIds: Uuid[],
    config: NodeSearchConfig,
    filters: SearchFilters | undefined,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    centerNodeId?: Uuid,
    originNodeIds?: Uuid[],
    ctx?: LlmContext,
  ): Promise<[EntityNode[], number[]]> {
    const { nodes, scores } = await this.nodeSearchImpl(
      query,
      queryVector,
      graphIds,
      config,
      filters,
      limit,
      minScore,
      model,
      centerNodeId,
      originNodeIds,
      ctx,
    );
    return [nodes, scores];
  }

  @Span('search.node', { attributes: RETRIEVER_ATTRS, onResult: metricsOnResult })
  private async nodeSearchImpl(
    query: string,
    queryVector: number[] | null,
    graphIds: Uuid[],
    config: NodeSearchConfig,
    filters: SearchFilters | undefined,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    centerNodeId?: Uuid,
    originNodeIds?: Uuid[],
    ctx?: LlmContext,
  ): Promise<{ nodes: EntityNode[]; scores: number[]; metrics: SpanMetrics }> {
    const fetch = 2 * limit;
    const nodeMap = new Map<Uuid, EntityNode>();

    const bm25Ids: Uuid[] = [];
    const cosineIds: Uuid[] = [];
    let bfsIds: Uuid[] = [];

    const tasks: Promise<void>[] = [];

    if (config.searchMethods.includes(NodeSearchMethod.bm25)) {
      tasks.push(
        this.entityNodeRepository
          .searchByName(
            SearchByTextParamsSchema.parse({ query, graphIds, limit: fetch }),
            filters,
          )
          .then((nodes) => {
            for (const n of nodes) nodeMap.set(n.id, n);
            bm25Ids.push(...nodes.map((n) => n.id));
          }),
      );
    }

    if (
      config.searchMethods.includes(NodeSearchMethod.cosine_similarity) &&
      queryVector
    ) {
      tasks.push(
        this.entityNodeRepository
          .searchBySimilarity(
            SearchBySimilarityParamsSchema.parse({
              embedding: queryVector,
              graphIds,
              limit: fetch,
              minScore: config.simMinScore,
            }),
            filters,
          )
          .then((nodes) => {
            for (const n of nodes) nodeMap.set(n.id, n);
            cosineIds.push(...nodes.map((n) => n.id));
          }),
      );
    }

    await Promise.all(tasks);

    if (config.searchMethods.includes(NodeSearchMethod.bfs)) {
      const origins =
        originNodeIds && originNodeIds.length > 0 ? originNodeIds : [...nodeMap.keys()];

      if (origins.length > 0) {
        const bfsNodes = await this.entityNodeRepository.searchByBfs(
          SearchByBfsParamsSchema.parse({
            originNodeIds: origins,
            graphIds,
            limit: fetch,
            maxDepth: config.maxDepth,
          }),
          filters,
        );
        for (const n of bfsNodes) nodeMap.set(n.id, n);
        bfsIds = bfsNodes.map((n) => n.id);
      }
    }

    const reranker = config.reranker;
    const rerankerMin = config.rerankerMinScore ?? minScore;

    let rankedIds: Uuid[];
    let rankedScores: number[];

    if (reranker === NodeReranker.rrf) {
      [rankedIds, rankedScores] = rrf(
        [bm25Ids, cosineIds, bfsIds].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else if (reranker === NodeReranker.mmr && queryVector) {
      const vectorPairs = new Map<Uuid, number[]>();
      for (const [id, node] of nodeMap) {
        if (node.nameEmbedding) vectorPairs.set(id, node.nameEmbedding);
      }
      [rankedIds, rankedScores] = mmr(
        queryVector,
        vectorPairs,
        config.mmrLambda,
        rerankerMin,
      );
    } else if (reranker === NodeReranker.cross_encoder && model) {
      const candidates = [...nodeMap.values()].slice(0, limit);
      [rankedIds, rankedScores] = await crossEncoderReranker(
        model,
        query,
        candidates.map((n) => ({ id: n.id, text: n.name })),
        rerankerMin,
        { llmTracer: this.llmTracer, ctx },
      );
    } else if (reranker === NodeReranker.node_distance) {
      if (!centerNodeId) {
        throw new Error('centerNodeId is required for node_distance reranker');
      }
      [rankedIds, rankedScores] = await nodeDistanceReranker(
        this.entityNodeRepository,
        [...nodeMap.keys()],
        centerNodeId,
        rerankerMin,
      );
    } else if (reranker === NodeReranker.episode_mentions) {
      [rankedIds, rankedScores] = await episodeMentionsReranker(
        this.entityNodeRepository,
        [bm25Ids, cosineIds, bfsIds].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else {
      [rankedIds, rankedScores] = rrf(
        [bm25Ids, cosineIds, bfsIds].filter((l) => l.length > 0),
        rerankerMin,
      );
    }

    const resultNodes = rankedIds
      .slice(0, limit)
      .map((id) => nodeMap.get(id))
      .filter((n): n is EntityNode => n !== undefined);
    const resultScores = rankedScores.slice(0, limit).slice(0, resultNodes.length);

    return {
      nodes: resultNodes,
      scores: resultScores,
      metrics: {
        'query.length': query.length,
        limit: limit,
        minScore: minScore,
        'config.searchMethods': config.searchMethods.join(','),
        'config.reranker': config.reranker,
        'result.count': resultNodes.length,
      },
    };
  }

  // ─── Episode search ─────────────────────────────────────────────────────────

  private async episodeSearch(
    query: string,
    graphIds: Uuid[],
    config: EpisodeSearchConfig,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    ctx?: LlmContext,
  ): Promise<[EpisodicNode[], number[]]> {
    const { episodes, scores } = await this.episodeSearchImpl(
      query,
      graphIds,
      config,
      limit,
      minScore,
      model,
      ctx,
    );
    return [episodes, scores];
  }

  @Span('search.episode', { attributes: RETRIEVER_ATTRS, onResult: metricsOnResult })
  private async episodeSearchImpl(
    query: string,
    graphIds: Uuid[],
    config: EpisodeSearchConfig,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    ctx?: LlmContext,
  ): Promise<{ episodes: EpisodicNode[]; scores: number[]; metrics: SpanMetrics }> {
    const fetch = 2 * limit;
    const rerankerMin = config.rerankerMinScore ?? minScore;

    const bm25Episodes = config.searchMethods.includes(EpisodeSearchMethod.bm25)
      ? await this.episodicNodeRepository.searchByContent(
          SearchByTextParamsSchema.parse({ query, graphIds, limit: fetch }),
        )
      : [];

    const episodeMap = new Map(bm25Episodes.map((ep) => [ep.id, ep]));
    const bm25Ids = bm25Episodes.map((ep) => ep.id);

    let rankedIds: Uuid[];
    let rankedScores: number[];

    if (config.reranker === EpisodeReranker.cross_encoder && model) {
      [rankedIds, rankedScores] = await crossEncoderReranker(
        model,
        query,
        bm25Episodes.slice(0, limit).map((ep) => ({ id: ep.id, text: ep.content })),
        rerankerMin,
        { llmTracer: this.llmTracer, ctx },
      );
    } else {
      [rankedIds, rankedScores] = rrf([bm25Ids], rerankerMin);
    }

    const resultEpisodes = rankedIds
      .slice(0, limit)
      .map((id) => episodeMap.get(id))
      .filter((ep): ep is EpisodicNode => ep !== undefined);
    const resultScores = rankedScores.slice(0, limit).slice(0, resultEpisodes.length);

    return {
      episodes: resultEpisodes,
      scores: resultScores,
      metrics: {
        'query.length': query.length,
        limit: limit,
        minScore: minScore,
        'result.count': resultEpisodes.length,
      },
    };
  }

  // ─── Community search ───────────────────────────────────────────────────────

  private async communitySearch(
    query: string,
    queryVector: number[] | null,
    graphIds: Uuid[],
    config: CommunitySearchConfig,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    ctx?: LlmContext,
  ): Promise<[CommunityNode[], number[]]> {
    const { communities, scores } = await this.communitySearchImpl(
      query,
      queryVector,
      graphIds,
      config,
      limit,
      minScore,
      model,
      ctx,
    );
    return [communities, scores];
  }

  @Span('search.community', { attributes: RETRIEVER_ATTRS, onResult: metricsOnResult })
  private async communitySearchImpl(
    query: string,
    queryVector: number[] | null,
    graphIds: Uuid[],
    config: CommunitySearchConfig,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    ctx?: LlmContext,
  ): Promise<{ communities: CommunityNode[]; scores: number[]; metrics: SpanMetrics }> {
    const fetch = 2 * limit;
    const communityMap = new Map<Uuid, CommunityNode>();
    const rerankerMin = config.rerankerMinScore ?? minScore;

    const bm25Ids: Uuid[] = [];
    const cosineIds: Uuid[] = [];

    const tasks: Promise<void>[] = [];

    if (config.searchMethods.includes(CommunitySearchMethod.bm25)) {
      tasks.push(
        this.communityNodeRepository
          .searchByName(SearchByTextParamsSchema.parse({ query, graphIds, limit: fetch }))
          .then((nodes) => {
            for (const n of nodes) communityMap.set(n.id, n);
            bm25Ids.push(...nodes.map((n) => n.id));
          }),
      );
    }

    if (
      config.searchMethods.includes(CommunitySearchMethod.cosine_similarity) &&
      queryVector
    ) {
      tasks.push(
        this.communityNodeRepository
          .searchBySimilarity(
            SearchBySimilarityParamsSchema.parse({
              embedding: queryVector,
              graphIds,
              limit: fetch,
              minScore: config.simMinScore,
            }),
          )
          .then((nodes) => {
            for (const n of nodes) communityMap.set(n.id, n);
            cosineIds.push(...nodes.map((n) => n.id));
          }),
      );
    }

    await Promise.all(tasks);

    let rankedIds: Uuid[];
    let rankedScores: number[];

    if (config.reranker === CommunityReranker.rrf) {
      [rankedIds, rankedScores] = rrf(
        [bm25Ids, cosineIds].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else if (config.reranker === CommunityReranker.mmr && queryVector) {
      const vectorPairs = new Map<Uuid, number[]>();
      for (const [id, community] of communityMap) {
        if (community.nameEmbedding) vectorPairs.set(id, community.nameEmbedding);
      }
      [rankedIds, rankedScores] = mmr(
        queryVector,
        vectorPairs,
        config.mmrLambda,
        rerankerMin,
      );
    } else if (config.reranker === CommunityReranker.cross_encoder && model) {
      const candidates = [...communityMap.values()].slice(0, limit);
      [rankedIds, rankedScores] = await crossEncoderReranker(
        model,
        query,
        candidates.map((c) => ({ id: c.id, text: c.name })),
        rerankerMin,
        { llmTracer: this.llmTracer, ctx },
      );
    } else {
      [rankedIds, rankedScores] = rrf(
        [bm25Ids, cosineIds].filter((l) => l.length > 0),
        rerankerMin,
      );
    }

    const resultCommunities = rankedIds
      .slice(0, limit)
      .map((id) => communityMap.get(id))
      .filter((c): c is CommunityNode => c !== undefined);
    const resultScores = rankedScores.slice(0, limit).slice(0, resultCommunities.length);

    return {
      communities: resultCommunities,
      scores: resultScores,
      metrics: {
        'query.length': query.length,
        limit: limit,
        minScore: minScore,
        'config.searchMethods': config.searchMethods.join(','),
        'config.reranker': config.reranker,
        'result.count': resultCommunities.length,
      },
    };
  }
}
