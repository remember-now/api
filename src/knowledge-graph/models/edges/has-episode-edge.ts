import { z } from 'zod';

import { createEdgeDefaults, EdgeBaseSchema } from './edge.types';

export const HasEpisodeEdgeSchema = EdgeBaseSchema;

export type HasEpisodeEdge = z.infer<typeof HasEpisodeEdgeSchema>;

export function createHasEpisodeEdge(
  partial: Partial<HasEpisodeEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): HasEpisodeEdge {
  return {
    ...createEdgeDefaults(),
    ...partial,
  };
}
