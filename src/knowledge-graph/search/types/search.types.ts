import { z } from 'zod';

import {
  CommunityNodeSchema,
  EntityEdgeSchema,
  EntityNodeSchema,
  EpisodicNodeSchema,
} from '../../models';
import { GroupIdSchema, UuidSchema } from '../../neo4j/types';
import { SearchConfigSchema } from './search-config.types';
import { SearchFiltersSchema } from './search-filters.types';

// Schemas

export const SearchResultsSchema = z.object({
  edges: z.array(EntityEdgeSchema),
  edgeScores: z.map(UuidSchema, z.number()),
  nodes: z.array(EntityNodeSchema),
  nodeScores: z.map(UuidSchema, z.number()),
  episodes: z.array(EpisodicNodeSchema),
  episodeScores: z.map(UuidSchema, z.number()),
  communities: z.array(CommunityNodeSchema),
  communityScores: z.map(UuidSchema, z.number()),
});

export const SearchOptionsSchema = z.object({
  userId: z.number(),
  query: z.string(),
  groupIds: z.array(GroupIdSchema),
  config: SearchConfigSchema,
  filters: SearchFiltersSchema.optional(),
  /** UUID of the node to use as the graph-distance anchor for node_distance reranking. */
  centerNodeUuid: UuidSchema.optional(),
  /** UUIDs of nodes to start BFS traversal from. */
  originNodeUuids: z.array(UuidSchema).optional(),
});

// Types

export type SearchResults = z.infer<typeof SearchResultsSchema>;
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
export type SearchOptionsInput = z.input<typeof SearchOptionsSchema>;

// Helpers

export function emptySearchResults(): SearchResults {
  return {
    edges: [],
    edgeScores: new Map(),
    nodes: [],
    nodeScores: new Map(),
    episodes: [],
    episodeScores: new Map(),
    communities: [],
    communityScores: new Map(),
  };
}

/**
 * Formats SearchResults as a structured JSON string suitable for use as LLM
 * context (mirrors graphiti's search_results_to_context_string).
 */
export function searchResultsToContextString(results: SearchResults): string {
  const facts = results.edges.map((e) => ({
    fact: e.fact,
    uuid: e.uuid,
    validAt: e.validAt?.toISOString() ?? null,
    invalidAt: e.invalidAt?.toISOString() ?? null,
  }));

  const entities = results.nodes.map((n) => ({
    name: n.name,
    uuid: n.uuid,
    summary: n.summary,
  }));

  const episodes = results.episodes.map((ep) => ({
    content: ep.content,
    uuid: ep.uuid,
    sourceDescription: ep.sourceDescription,
    validAt: ep.validAt?.toISOString() ?? null,
  }));

  const communities = results.communities.map((c) => ({
    name: c.name,
    uuid: c.uuid,
    summary: c.summary,
  }));

  return JSON.stringify({ facts, entities, episodes, communities }, null, 2);
}
