import { z } from 'zod';

import { EntityEdge, EpisodicEdge } from '../models/edges';
import { EntityNode, EpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';

export type EntityTypeMap = Record<
  string,
  {
    description: string;
    schema?: z.ZodTypeAny;
  }
>;

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
  customInstructions?: string;
  updateCommunities?: boolean;
}

export interface AddEpisodeResult {
  episode: EpisodicNode;
  nodes: EntityNode[];
  edges: EntityEdge[];
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
