import { z } from 'zod';

import { createEdgeDefaults, EdgeBaseSchema } from './edge.types';

export const CommunityEdgeSchema = EdgeBaseSchema;

export type CommunityEdge = z.infer<typeof CommunityEdgeSchema>;

export function createCommunityEdge(
  partial: Partial<CommunityEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): CommunityEdge {
  return {
    ...createEdgeDefaults(),
    ...partial,
  };
}
