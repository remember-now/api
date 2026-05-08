import { z } from 'zod';

import {
  EntityEdge,
  EntityNode,
  EpisodeType,
  EpisodicEdge,
  EpisodicNode,
} from '../models';
import { GroupId, Uuid, UuidSchema } from '../neo4j/neo4j.schemas';

// Schemas

export const NodeSummarySchema = z.object({
  summaries: z.array(
    z.object({
      uuid: UuidSchema,
      summary: z.string(),
    }),
  ),
});

// Types

export type NodeSummary = z.infer<typeof NodeSummarySchema>;

export type EntityTypeMap = Record<
  string,
  {
    description: string;
    schema: z.ZodTypeAny;
  }
>;

export type EdgeTypesMap = Record<
  string,
  {
    description: string;
    schema: z.ZodTypeAny;
  }
>;

// key format: "SourceLabel,TargetLabel" — e.g. "Person,Company", "Entity,Entity"
export type EdgeTypeMap = Record<string, string[]>;

// Interfaces

export interface AddEpisodeOptions {
  userId: number;
  name: string;
  content: string;
  source?: EpisodeType;
  sourceDescription?: string;
  groupId: GroupId;
  referenceTime?: Date;
  sagaUuid?: Uuid;
  entityTypes?: EntityTypeMap;
  edgeTypes?: EdgeTypesMap;
  edgeTypeMap?: EdgeTypeMap;
  excludedEntityTypes?: string[];
  customInstructions?: string;
  updateCommunities?: boolean;
}

export interface AddEpisodeResult {
  episode: EpisodicNode;
  nodes: EntityNode[];
  edges: EntityEdge[];
  invalidatedEdges: EntityEdge[];
  episodicEdges: EpisodicEdge[];
}

// JSON Schemas

export const nodeSummaryJsonSchema = z.toJSONSchema(NodeSummarySchema);

// Helpers

/**
 * Returns the subset of `edgeTypes` that are valid for the given source/target
 * label combination, as determined by `edgeTypeMap`.
 *
 * `edgeTypeMap` keys are `"SourceLabel,TargetLabel"` strings. For each
 * combination of source and target labels, the map yields edge type names whose
 * definitions are then looked up in `edgeTypes`. Duplicates are deduplicated
 * (first occurrence wins).
 *
 * @example
 * // sourceLabels: ['Person'], targetLabels: ['Company']
 * // edgeTypeMap:  { 'Person,Company': ['WORKS_AT', 'FOUNDED'] }
 * // edgeTypes:    { WORKS_AT: { description: '...', schema: ... }, FOUNDED: { ... } }
 * // → { WORKS_AT: { description: '...', schema: ... }, FOUNDED: { ... } }
 */
export function getApplicableEdgeTypes(
  sourceLabels: string[],
  targetLabels: string[],
  edgeTypes: EdgeTypesMap,
  edgeTypeMap: EdgeTypeMap,
): EdgeTypesMap {
  const result: EdgeTypesMap = {};

  for (const src of sourceLabels) {
    for (const tgt of targetLabels) {
      const key = `${src},${tgt}`;

      for (const typeName of edgeTypeMap[key] ?? []) {
        const typeDef = edgeTypes[typeName];
        if (typeDef && !(typeName in result)) result[typeName] = typeDef;
      }
    }
  }
  return result;
}
