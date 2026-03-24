import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';

import { LlmService } from '@/llm/llm.service';

import { EmbeddingService } from '../embedding';
import { EntityEdge } from '../models/edges/entity-edge';
import { CommunityNode } from '../models/nodes/community-node';
import { EntityNode } from '../models/nodes/entity-node';
import { EpisodicNode } from '../models/nodes/episodic-node';
import { validateGroupId } from '../neo4j/neo4j-label-validation';
import { Neo4jService } from '../neo4j/neo4j.service';
import {
  CommunityNodeRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicNodeRepository,
} from '../neo4j/repositories';
import {
  CommunityReranker,
  CommunitySearchConfig,
  CommunitySearchMethod,
  DEFAULT_SEARCH_LIMIT,
  EdgeReranker,
  EdgeSearchConfig,
  EdgeSearchMethod,
  EpisodeReranker,
  EpisodeSearchConfig,
  EpisodeSearchMethod,
  NodeReranker,
  NodeSearchConfig,
  NodeSearchMethod,
  SearchConfig,
} from './search-config.types';
import { luceneSanitize } from './search-filters';
import { SearchFilters } from './search-filters.types';
import {
  crossEncoderReranker,
  episodeMentionsReranker,
  mmr,
  nodeDistanceReranker,
  rrf,
} from './search-utils';
import {
  emptySearchResults,
  SearchOptions,
  SearchResults,
} from './search.types';

@Injectable()
export class SearchService {
  constructor(
    private readonly llmService: LlmService,
    private readonly embeddingService: EmbeddingService,
    private readonly neo4jService: Neo4jService,
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly entityEdgeRepository: EntityEdgeRepository,
    private readonly episodicNodeRepository: EpisodicNodeRepository,
    private readonly communityNodeRepository: CommunityNodeRepository,
  ) {}

  async searchFromNodes(options: {
    nodeUuids: string[];
    query: string;
    groupIds: string[];
    config: SearchConfig;
    userId: number;
    filters?: SearchFilters;
  }): Promise<SearchResults> {
    return this.search({
      query: options.query,
      groupIds: options.groupIds,
      config: options.config,
      userId: options.userId,
      filters: options.filters,
      originNodeUuids: options.nodeUuids,
      centerNodeUuid: options.nodeUuids[0],
    });
  }

  async search(options: SearchOptions): Promise<SearchResults> {
    if (!options.query.trim()) return emptySearchResults();

    const {
      query,
      groupIds,
      config,
      filters,
      centerNodeUuid,
      originNodeUuids,
    } = options;

    for (const groupId of groupIds) {
      validateGroupId(groupId);
    }
    const limit = config.limit ?? DEFAULT_SEARCH_LIMIT;
    const minScore = config.rerankerMinScore ?? 0;

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
      needsVector
        ? this.embeddingService.embedText(query)
        : Promise.resolve(null),
      needsModel
        ? this.llmService.getActiveModel(options.userId)
        : Promise.resolve(null),
    ]);

    const [edgeResult, nodeResult, episodeResult, communityResult] =
      await Promise.all([
        config.edgeConfig
          ? this.edgeSearch(
              query,
              queryVector,
              groupIds,
              config.edgeConfig,
              filters,
              limit,
              minScore,
              model,
              centerNodeUuid,
              originNodeUuids,
            )
          : Promise.resolve([[], []] as [EntityEdge[], number[]]),
        config.nodeConfig
          ? this.nodeSearch(
              query,
              queryVector,
              groupIds,
              config.nodeConfig,
              filters,
              limit,
              minScore,
              model,
              centerNodeUuid,
              originNodeUuids,
            )
          : Promise.resolve([[], []] as [EntityNode[], number[]]),
        config.episodeConfig
          ? this.episodeSearch(
              query,
              groupIds,
              config.episodeConfig,
              limit,
              minScore,
              model,
            )
          : Promise.resolve([[], []] as [EpisodicNode[], number[]]),
        config.communityConfig
          ? this.communitySearch(
              query,
              queryVector,
              groupIds,
              config.communityConfig,
              limit,
              minScore,
              model,
            )
          : Promise.resolve([[], []] as [CommunityNode[], number[]]),
      ]);

    const [edges, edgeScoreArr] = edgeResult;
    const [nodes, nodeScoreArr] = nodeResult;
    const [episodes, episodeScoreArr] = episodeResult;
    const [communities, communityScoreArr] = communityResult;

    return {
      edges,
      edgeScores: new Map(edges.map((e, i) => [e.uuid, edgeScoreArr[i]])),
      nodes,
      nodeScores: new Map(nodes.map((n, i) => [n.uuid, nodeScoreArr[i]])),
      episodes,
      episodeScores: new Map(
        episodes.map((ep, i) => [ep.uuid, episodeScoreArr[i]]),
      ),
      communities,
      communityScores: new Map(
        communities.map((c, i) => [c.uuid, communityScoreArr[i]]),
      ),
    };
  }

  // ─── Edge search ───────────────────────────────────────────────────────────

  private async edgeSearch(
    query: string,
    queryVector: number[] | null,
    groupIds: string[],
    config: EdgeSearchConfig,
    filters: SearchFilters | undefined,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    centerNodeUuid?: string,
    originNodeUuids?: string[],
  ): Promise<[EntityEdge[], number[]]> {
    const fetch = 2 * limit;
    const edgeMap = new Map<string, EntityEdge>();

    const bm25Uuids: string[] = [];
    const cosineUuids: string[] = [];
    let bfsUuids: string[] = [];

    const tasks: Promise<void>[] = [];

    if (config.searchMethods.includes(EdgeSearchMethod.bm25)) {
      tasks.push(
        this.entityEdgeRepository
          .searchByFact(luceneSanitize(query), groupIds, fetch)
          .then((edges) => {
            for (const e of edges) edgeMap.set(e.uuid, e);
            bm25Uuids.push(...edges.map((e) => e.uuid));
          }),
      );
    }

    if (
      config.searchMethods.includes(EdgeSearchMethod.cosine_similarity) &&
      queryVector
    ) {
      tasks.push(
        this.entityEdgeRepository
          .searchBySimilarity(queryVector, groupIds, fetch, filters)
          .then((edges) => {
            for (const e of edges) edgeMap.set(e.uuid, e);
            cosineUuids.push(...edges.map((e) => e.uuid));
          }),
      );
    }

    await Promise.all(tasks);

    if (config.searchMethods.includes(EdgeSearchMethod.bfs)) {
      const origins =
        originNodeUuids && originNodeUuids.length > 0
          ? originNodeUuids
          : [...edgeMap.values()].map((e) => e.sourceNodeUuid);

      if (origins.length > 0) {
        const bfsEdges = await this.entityEdgeRepository.searchByBfs(
          origins,
          groupIds,
          fetch,
          filters,
          config.maxDepth,
        );
        for (const e of bfsEdges) edgeMap.set(e.uuid, e);
        bfsUuids = bfsEdges.map((e) => e.uuid);
      }
    }

    const reranker = config.reranker;
    const rerankerMin = config.rerankerMinScore ?? minScore;

    let rankedUuids: string[];
    let rankedScores: number[];

    if (reranker === EdgeReranker.rrf) {
      [rankedUuids, rankedScores] = rrf(
        [bm25Uuids, cosineUuids, bfsUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else if (reranker === EdgeReranker.mmr && queryVector) {
      const vectorPairs = new Map<string, number[]>();
      for (const [uuid, edge] of edgeMap) {
        if (edge.factEmbedding) vectorPairs.set(uuid, edge.factEmbedding);
      }
      [rankedUuids, rankedScores] = mmr(
        queryVector,
        vectorPairs,
        config.mmrLambda,
        rerankerMin,
      );
    } else if (reranker === EdgeReranker.cross_encoder && model) {
      const candidates = [...edgeMap.values()].slice(0, limit);
      [rankedUuids, rankedScores] = await crossEncoderReranker(
        model,
        query,
        candidates.map((e) => ({ uuid: e.uuid, text: e.fact })),
        rerankerMin,
      );
    } else if (reranker === EdgeReranker.node_distance) {
      if (!centerNodeUuid) {
        throw new Error(
          'centerNodeUuid is required for node_distance reranker',
        );
      }
      const sourceUuids = [
        ...new Set([...edgeMap.values()].map((e) => e.sourceNodeUuid)),
      ];
      const [rankedSourceUuids, sourceScores] = await nodeDistanceReranker(
        this.neo4jService,
        sourceUuids,
        centerNodeUuid,
        rerankerMin,
      );
      // Map source UUIDs back to edge UUIDs (preserving order)
      const sourceScoreMap = new Map(
        rankedSourceUuids.map((u, i) => [u, sourceScores[i]]),
      );
      const edgeEntries: [string, number][] = [];
      for (const [uuid, edge] of edgeMap) {
        const score = sourceScoreMap.get(edge.sourceNodeUuid);
        if (score !== undefined) edgeEntries.push([uuid, score]);
      }
      edgeEntries.sort((a, b) => b[1] - a[1]);
      rankedUuids = edgeEntries.map(([u]) => u);
      rankedScores = edgeEntries.map(([, s]) => s);
    } else if (reranker === EdgeReranker.episode_mentions) {
      // RRF preliminary ranking, then sort by episode count descending.
      // Matches Python search.py:256-305: rrf runs first for both EdgeReranker.rrf
      // and EdgeReranker.episode_mentions, then episode_mentions applies the sort.
      const [rrfUuids, rrfScores] = rrf(
        [bm25Uuids, cosineUuids, bfsUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
      const rrfScoreMap = new Map(rrfUuids.map((u, i) => [u, rrfScores[i]]));
      const rrfEdges = rrfUuids
        .map((uuid) => edgeMap.get(uuid))
        .filter((e): e is EntityEdge => e !== undefined);
      rrfEdges.sort((a, b) => b.episodes.length - a.episodes.length);
      rankedUuids = rrfEdges.map((e) => e.uuid);
      rankedScores = rankedUuids.map((u) => rrfScoreMap.get(u) ?? 0);
    } else {
      // Fallback: RRF
      [rankedUuids, rankedScores] = rrf(
        [bm25Uuids, cosineUuids, bfsUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
    }

    const resultEdges = rankedUuids
      .slice(0, limit)
      .map((uuid) => edgeMap.get(uuid))
      .filter((e): e is EntityEdge => e !== undefined);
    const resultScores = rankedScores
      .slice(0, limit)
      .slice(0, resultEdges.length);

    return [resultEdges, resultScores];
  }

  // ─── Node search ───────────────────────────────────────────────────────────

  private async nodeSearch(
    query: string,
    queryVector: number[] | null,
    groupIds: string[],
    config: NodeSearchConfig,
    filters: SearchFilters | undefined,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
    centerNodeUuid?: string,
    originNodeUuids?: string[],
  ): Promise<[EntityNode[], number[]]> {
    const fetch = 2 * limit;
    const nodeMap = new Map<string, EntityNode>();

    const bm25Uuids: string[] = [];
    const cosineUuids: string[] = [];
    let bfsUuids: string[] = [];

    const tasks: Promise<void>[] = [];

    if (config.searchMethods.includes(NodeSearchMethod.bm25)) {
      tasks.push(
        this.entityNodeRepository
          .searchByName(luceneSanitize(query), groupIds, fetch, filters)
          .then((nodes) => {
            for (const n of nodes) nodeMap.set(n.uuid, n);
            bm25Uuids.push(...nodes.map((n) => n.uuid));
          }),
      );
    }

    if (
      config.searchMethods.includes(NodeSearchMethod.cosine_similarity) &&
      queryVector
    ) {
      tasks.push(
        this.entityNodeRepository
          .searchBySimilarity(queryVector, groupIds, fetch, filters)
          .then((nodes) => {
            for (const n of nodes) nodeMap.set(n.uuid, n);
            cosineUuids.push(...nodes.map((n) => n.uuid));
          }),
      );
    }

    await Promise.all(tasks);

    if (config.searchMethods.includes(NodeSearchMethod.bfs)) {
      const origins =
        originNodeUuids && originNodeUuids.length > 0
          ? originNodeUuids
          : [...nodeMap.keys()];

      if (origins.length > 0) {
        const bfsNodes = await this.entityNodeRepository.searchByBfs(
          origins,
          groupIds,
          fetch,
          filters,
          config.maxDepth,
        );
        for (const n of bfsNodes) nodeMap.set(n.uuid, n);
        bfsUuids = bfsNodes.map((n) => n.uuid);
      }
    }

    const reranker = config.reranker;
    const rerankerMin = config.rerankerMinScore ?? minScore;

    let rankedUuids: string[];
    let rankedScores: number[];

    if (reranker === NodeReranker.rrf) {
      [rankedUuids, rankedScores] = rrf(
        [bm25Uuids, cosineUuids, bfsUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else if (reranker === NodeReranker.mmr && queryVector) {
      const vectorPairs = new Map<string, number[]>();
      for (const [uuid, node] of nodeMap) {
        if (node.nameEmbedding) vectorPairs.set(uuid, node.nameEmbedding);
      }
      [rankedUuids, rankedScores] = mmr(
        queryVector,
        vectorPairs,
        config.mmrLambda,
        rerankerMin,
      );
    } else if (reranker === NodeReranker.cross_encoder && model) {
      const candidates = [...nodeMap.values()].slice(0, limit);
      [rankedUuids, rankedScores] = await crossEncoderReranker(
        model,
        query,
        candidates.map((n) => ({ uuid: n.uuid, text: n.name })),
        rerankerMin,
      );
    } else if (reranker === NodeReranker.node_distance) {
      if (!centerNodeUuid) {
        throw new Error(
          'centerNodeUuid is required for node_distance reranker',
        );
      }
      [rankedUuids, rankedScores] = await nodeDistanceReranker(
        this.neo4jService,
        [...nodeMap.keys()],
        centerNodeUuid,
        rerankerMin,
      );
    } else if (reranker === NodeReranker.episode_mentions) {
      [rankedUuids, rankedScores] = await episodeMentionsReranker(
        this.neo4jService,
        [bm25Uuids, cosineUuids, bfsUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else {
      [rankedUuids, rankedScores] = rrf(
        [bm25Uuids, cosineUuids, bfsUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
    }

    const resultNodes = rankedUuids
      .slice(0, limit)
      .map((uuid) => nodeMap.get(uuid))
      .filter((n): n is EntityNode => n !== undefined);
    const resultScores = rankedScores
      .slice(0, limit)
      .slice(0, resultNodes.length);

    return [resultNodes, resultScores];
  }

  // ─── Episode search ─────────────────────────────────────────────────────────

  private async episodeSearch(
    query: string,
    groupIds: string[],
    config: EpisodeSearchConfig,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
  ): Promise<[EpisodicNode[], number[]]> {
    const fetch = 2 * limit;
    const rerankerMin = config.rerankerMinScore ?? minScore;

    const bm25Episodes = config.searchMethods.includes(EpisodeSearchMethod.bm25)
      ? await this.episodicNodeRepository.searchByContent(
          luceneSanitize(query),
          groupIds,
          fetch,
        )
      : [];

    const episodeMap = new Map(bm25Episodes.map((ep) => [ep.uuid, ep]));
    const bm25Uuids = bm25Episodes.map((ep) => ep.uuid);

    let rankedUuids: string[];
    let rankedScores: number[];

    if (config.reranker === EpisodeReranker.cross_encoder && model) {
      [rankedUuids, rankedScores] = await crossEncoderReranker(
        model,
        query,
        bm25Episodes
          .slice(0, limit)
          .map((ep) => ({ uuid: ep.uuid, text: ep.content })),
        rerankerMin,
      );
    } else {
      [rankedUuids, rankedScores] = rrf([bm25Uuids], rerankerMin);
    }

    const resultEpisodes = rankedUuids
      .slice(0, limit)
      .map((uuid) => episodeMap.get(uuid))
      .filter((ep): ep is EpisodicNode => ep !== undefined);
    const resultScores = rankedScores
      .slice(0, limit)
      .slice(0, resultEpisodes.length);

    return [resultEpisodes, resultScores];
  }

  // ─── Community search ───────────────────────────────────────────────────────

  private async communitySearch(
    query: string,
    queryVector: number[] | null,
    groupIds: string[],
    config: CommunitySearchConfig,
    limit: number,
    minScore: number,
    model: BaseChatModel | null,
  ): Promise<[CommunityNode[], number[]]> {
    const fetch = 2 * limit;
    const communityMap = new Map<string, CommunityNode>();
    const rerankerMin = config.rerankerMinScore ?? minScore;

    const bm25Uuids: string[] = [];
    const cosineUuids: string[] = [];

    const tasks: Promise<void>[] = [];

    if (config.searchMethods.includes(CommunitySearchMethod.bm25)) {
      tasks.push(
        this.communityNodeRepository
          .searchByName(luceneSanitize(query), groupIds, fetch)
          .then((nodes) => {
            for (const n of nodes) communityMap.set(n.uuid, n);
            bm25Uuids.push(...nodes.map((n) => n.uuid));
          }),
      );
    }

    if (
      config.searchMethods.includes(CommunitySearchMethod.cosine_similarity) &&
      queryVector
    ) {
      tasks.push(
        this.communityNodeRepository
          .searchBySimilarity(queryVector, groupIds, fetch)
          .then((nodes) => {
            for (const n of nodes) communityMap.set(n.uuid, n);
            cosineUuids.push(...nodes.map((n) => n.uuid));
          }),
      );
    }

    await Promise.all(tasks);

    let rankedUuids: string[];
    let rankedScores: number[];

    if (config.reranker === CommunityReranker.rrf) {
      [rankedUuids, rankedScores] = rrf(
        [bm25Uuids, cosineUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
    } else if (config.reranker === CommunityReranker.mmr && queryVector) {
      const vectorPairs = new Map<string, number[]>();
      for (const [uuid, community] of communityMap) {
        if (community.nameEmbedding)
          vectorPairs.set(uuid, community.nameEmbedding);
      }
      [rankedUuids, rankedScores] = mmr(
        queryVector,
        vectorPairs,
        config.mmrLambda,
        rerankerMin,
      );
    } else if (config.reranker === CommunityReranker.cross_encoder && model) {
      const candidates = [...communityMap.values()].slice(0, limit);
      [rankedUuids, rankedScores] = await crossEncoderReranker(
        model,
        query,
        candidates.map((c) => ({ uuid: c.uuid, text: c.name })),
        rerankerMin,
      );
    } else {
      [rankedUuids, rankedScores] = rrf(
        [bm25Uuids, cosineUuids].filter((l) => l.length > 0),
        rerankerMin,
      );
    }

    const resultCommunities = rankedUuids
      .slice(0, limit)
      .map((uuid) => communityMap.get(uuid))
      .filter((c): c is CommunityNode => c !== undefined);
    const resultScores = rankedScores
      .slice(0, limit)
      .slice(0, resultCommunities.length);

    return [resultCommunities, resultScores];
  }
}
