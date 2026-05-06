import { z } from 'zod';

import { createEdgeDefaults, EdgeBaseSchema } from './edge.types';

export const NextEpisodeEdgeSchema = EdgeBaseSchema;

export type NextEpisodeEdge = z.infer<typeof NextEpisodeEdgeSchema>;

export function createNextEpisodeEdge(
  partial: Partial<NextEpisodeEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): NextEpisodeEdge {
  return {
    ...createEdgeDefaults(),
    ...partial,
  };
}
