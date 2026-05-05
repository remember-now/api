import { z } from 'zod';

import { EntityEdge, EpisodicEdge } from '../models/edges';
import { EntityNode, EpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';

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

export interface AddEpisodeOptions {
  userId: number;
  name: string;
  content: string;
  source?: EpisodeType;
  sourceDescription?: string;
  groupId: string;
  referenceTime?: Date;
  sagaUuid?: string;
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

export const NodeSummarySchema = z.object({
  summaries: z.array(
    z.object({
      uuid: z.string(),
      summary: z.string(),
    }),
  ),
});

export type NodeSummary = z.infer<typeof NodeSummarySchema>;

export const nodeSummaryJsonSchema = z.toJSONSchema(NodeSummarySchema);
