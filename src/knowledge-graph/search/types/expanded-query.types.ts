import { z } from 'zod';

import type { Uuid } from '@/common/schemas';

import type { EntityEdge, EntityNode, EpisodicNode } from '../../models';
import { MAX_RESULTS_PER_GROUP } from './search-config.types';

// Typed sub-query authored by the agent for on-demand knowledge search.
// `vec` and `hyde` are identical at retrieval (embed text -> vector search);
// the distinction is purely how the agent composes the text (`hyde` = a
// hypothetical answer rather than a rephrased question).

export enum SubQueryType {
  lex = 'lex',
  vec = 'vec',
  hyde = 'hyde',
}

export const ExpandedQuerySchema = z
  .object({
    type: z.enum(SubQueryType),
    text: z.string().min(1),
  })
  .refine((q) => q.type !== SubQueryType.lex || !/[\r\n]/.test(q.text), {
    message: 'lex query must be a single line',
    path: ['text'],
  })
  .refine(
    (q) => q.type !== SubQueryType.lex || (q.text.match(/"/g)?.length ?? 0) % 2 === 0,
    { message: 'lex query has an unbalanced double quote', path: ['text'] },
  )
  .refine((q) => q.type === SubQueryType.lex || !/(^|\s)-[\w"]/.test(q.text), {
    message: 'negation (-term) is only supported in lex queries',
    path: ['text'],
  });

// One independent search area: a restated question, its typed sub-queries, and
// the number of results the agent wants back for this area (it decides; the
// bounds are only a guardrail).
export const SearchGroupSchema = z.object({
  originalQuery: z.string().min(1),
  queries: z.array(ExpandedQuerySchema).min(1),
  limit: z
    .int()
    .min(1)
    .max(MAX_RESULTS_PER_GROUP)
    .describe(
      'How many results to return for this area. Choose based on how much you need.',
    ),
});

export type ExpandedQuery = z.infer<typeof ExpandedQuerySchema>;
export type SearchGroup = z.infer<typeof SearchGroupSchema>;

// Result of agentic search: edges/nodes/episodes fused into one ranking (no
// cross-encoder; the agent reranks). `scores` is keyed by entity id across all
// types. `episodeSnippets` carries ts_headline excerpts for returned episodes.
export interface AgenticSearchResults {
  edges: EntityEdge[];
  nodes: EntityNode[];
  episodes: EpisodicNode[];
  scores: Map<Uuid, number>;
  episodeSnippets: Map<Uuid, string>;
}

export function emptyAgenticResults(): AgenticSearchResults {
  return {
    edges: [],
    nodes: [],
    episodes: [],
    scores: new Map(),
    episodeSnippets: new Map(),
  };
}
