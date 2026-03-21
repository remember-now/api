import { EntityEdge } from '../models/edges/entity-edge';
import { CommunityNode } from '../models/nodes/community-node';
import { EntityNode } from '../models/nodes/entity-node';
import { EpisodicNode } from '../models/nodes/episodic-node';
import { SearchConfig } from './search-config.types';
import { SearchFilters } from './search-filters.types';

export interface SearchResults {
  edges: EntityEdge[];
  edgeScores: Map<string, number>;
  nodes: EntityNode[];
  nodeScores: Map<string, number>;
  episodes: EpisodicNode[];
  episodeScores: Map<string, number>;
  communities: CommunityNode[];
  communityScores: Map<string, number>;
}

export interface SearchOptions {
  userId: number;
  query: string;
  groupIds: string[];
  config: SearchConfig;
  filters?: SearchFilters;
  /** UUID of the node to use as the graph-distance anchor for node_distance reranking. */
  centerNodeUuid?: string;
  /** UUIDs of nodes to start BFS traversal from. */
  originNodeUuids?: string[];
}

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
