export const DEFAULT_SEARCH_LIMIT = 10;
export const DEFAULT_MIN_SCORE = 0.6;
export const DEFAULT_MMR_LAMBDA = 0.5;
export const MAX_SEARCH_DEPTH = 3;

export enum EdgeSearchMethod {
  bm25 = 'bm25',
  cosine_similarity = 'cosine_similarity',
  bfs = 'bfs',
}

export enum NodeSearchMethod {
  bm25 = 'bm25',
  cosine_similarity = 'cosine_similarity',
  bfs = 'bfs',
}

export enum EpisodeSearchMethod {
  bm25 = 'bm25',
}

export enum CommunitySearchMethod {
  bm25 = 'bm25',
  cosine_similarity = 'cosine_similarity',
}

export enum EdgeReranker {
  rrf = 'rrf',
  mmr = 'mmr',
  cross_encoder = 'cross_encoder',
  node_distance = 'node_distance',
  episode_mentions = 'episode_mentions',
}

export enum NodeReranker {
  rrf = 'rrf',
  mmr = 'mmr',
  cross_encoder = 'cross_encoder',
  node_distance = 'node_distance',
  episode_mentions = 'episode_mentions',
}

export enum EpisodeReranker {
  rrf = 'rrf',
  cross_encoder = 'cross_encoder',
}

export enum CommunityReranker {
  rrf = 'rrf',
  mmr = 'mmr',
  cross_encoder = 'cross_encoder',
}

export interface EdgeSearchConfig {
  searchMethods: EdgeSearchMethod[];
  reranker: EdgeReranker;
  limit?: number;
  rerankerMinScore?: number;
  mmrLambda?: number;
  /** BFS traversal depth. Defaults to MAX_SEARCH_DEPTH (3). Must be a positive integer. */
  maxDepth?: number;
}

export interface NodeSearchConfig {
  searchMethods: NodeSearchMethod[];
  reranker: NodeReranker;
  limit?: number;
  rerankerMinScore?: number;
  mmrLambda?: number;
  /** BFS traversal depth. Defaults to MAX_SEARCH_DEPTH (3). Must be a positive integer. */
  maxDepth?: number;
}

export interface EpisodeSearchConfig {
  searchMethods: EpisodeSearchMethod[];
  reranker: EpisodeReranker;
  limit?: number;
  rerankerMinScore?: number;
}

export interface CommunitySearchConfig {
  searchMethods: CommunitySearchMethod[];
  reranker: CommunityReranker;
  limit?: number;
  rerankerMinScore?: number;
  mmrLambda?: number;
}

export interface SearchConfig {
  edgeConfig?: EdgeSearchConfig;
  nodeConfig?: NodeSearchConfig;
  episodeConfig?: EpisodeSearchConfig;
  communityConfig?: CommunitySearchConfig;
  limit: number;
  rerankerMinScore: number;
}
