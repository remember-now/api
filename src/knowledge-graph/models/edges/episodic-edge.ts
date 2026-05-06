import { z } from 'zod';

import { createEdgeDefaults, EdgeBaseSchema } from './edge.types';

export const EpisodicEdgeSchema = EdgeBaseSchema;

export type EpisodicEdge = z.infer<typeof EpisodicEdgeSchema>;

export function createEpisodicEdge(
  partial: Partial<EpisodicEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): EpisodicEdge {
  return {
    ...createEdgeDefaults(),
    ...partial,
  };
}
