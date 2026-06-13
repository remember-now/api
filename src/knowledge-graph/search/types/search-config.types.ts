import { z } from 'zod';

// Constants

export const DEFAULT_SEARCH_LIMIT = 10;
export const DEFAULT_MIN_SCORE = 0.6;
export const DEFAULT_MMR_LAMBDA = 0.5;
export const MAX_SEARCH_DEPTH = 3;

// TODO: Tune
// Weighted RRF + mode limits. Values ported from qmd as placeholders — tune
// against the eval set before treating any as final.

export const RRF_K = 60; // qmd default — tune against eval set
export const RRF_ORIGINAL_WEIGHT = 2; // qmd default — tune against eval set
export const RRF_TOP_RANK_BONUS = 0.05; // qmd default — tune against eval set
export const RRF_SECOND_RANK_BONUS = 0.02; // qmd default — tune against eval set

export const AGENTIC_CANDIDATE_LIMIT = 30; // qmd default — tune against eval set

// Per-search-group return count is chosen by the agent; this only guardrails it.
export const MAX_RESULTS_PER_GROUP = 25; // guardrail ceiling — tune against eval set

export const PREFETCH_LIMIT = 5; // tune against eval set
export const PREFETCH_CANDIDATES = 20; // tune against eval set
export const PREFETCH_BFS_DEPTH = 1; // tune against eval set

// ts_rank_cd normalization bitmask: 1 = divide by 1 + log(length) (long content
// like episodes); 0 = no length normalization (short facts/names).
export const FTS_NORM_LOG_LENGTH = 1;
export const FTS_NORM_NONE = 0;

// Enums

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

// Schemas

export const EdgeSearchConfigSchema = z.object({
  searchMethods: z.array(z.enum(EdgeSearchMethod)),
  reranker: z.enum(EdgeReranker),
  limit: z.number().int().positive().default(DEFAULT_SEARCH_LIMIT),
  rerankerMinScore: z.number().optional(),
  simMinScore: z.number().default(DEFAULT_MIN_SCORE),
  mmrLambda: z.number().default(DEFAULT_MMR_LAMBDA),
  maxDepth: z.number().int().positive().default(MAX_SEARCH_DEPTH),
});

export const NodeSearchConfigSchema = z.object({
  searchMethods: z.array(z.enum(NodeSearchMethod)),
  reranker: z.enum(NodeReranker),
  limit: z.number().int().positive().default(DEFAULT_SEARCH_LIMIT),
  rerankerMinScore: z.number().optional(),
  simMinScore: z.number().default(DEFAULT_MIN_SCORE),
  mmrLambda: z.number().default(DEFAULT_MMR_LAMBDA),
  maxDepth: z.number().int().positive().default(MAX_SEARCH_DEPTH),
});

export const EpisodeSearchConfigSchema = z.object({
  searchMethods: z.array(z.enum(EpisodeSearchMethod)),
  reranker: z.enum(EpisodeReranker),
  limit: z.number().int().positive().default(DEFAULT_SEARCH_LIMIT),
  rerankerMinScore: z.number().optional(),
});

export const CommunitySearchConfigSchema = z.object({
  searchMethods: z.array(z.enum(CommunitySearchMethod)),
  reranker: z.enum(CommunityReranker),
  limit: z.number().int().positive().default(DEFAULT_SEARCH_LIMIT),
  rerankerMinScore: z.number().optional(),
  simMinScore: z.number().default(DEFAULT_MIN_SCORE),
  mmrLambda: z.number().default(DEFAULT_MMR_LAMBDA),
});

export const SearchConfigSchema = z.object({
  edgeConfig: EdgeSearchConfigSchema.optional(),
  nodeConfig: NodeSearchConfigSchema.optional(),
  episodeConfig: EpisodeSearchConfigSchema.optional(),
  communityConfig: CommunitySearchConfigSchema.optional(),
  limit: z.number().int().positive().default(DEFAULT_SEARCH_LIMIT),
  rerankerMinScore: z.number().default(0),
});

// Types

export type EdgeSearchConfig = z.infer<typeof EdgeSearchConfigSchema>;
export type EdgeSearchConfigInput = z.input<typeof EdgeSearchConfigSchema>;
export type NodeSearchConfig = z.infer<typeof NodeSearchConfigSchema>;
export type NodeSearchConfigInput = z.input<typeof NodeSearchConfigSchema>;
export type EpisodeSearchConfig = z.infer<typeof EpisodeSearchConfigSchema>;
export type EpisodeSearchConfigInput = z.input<typeof EpisodeSearchConfigSchema>;
export type CommunitySearchConfig = z.infer<typeof CommunitySearchConfigSchema>;
export type CommunitySearchConfigInput = z.input<typeof CommunitySearchConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type SearchConfigInput = z.input<typeof SearchConfigSchema>;
