import { createEdgeDefaults, EdgeBase, EdgeBaseSchema } from './edge.types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NextEpisodeEdge extends EdgeBase {}

export const NextEpisodeEdgeSchema = EdgeBaseSchema;

export function createNextEpisodeEdge(
  partial: Partial<NextEpisodeEdge> & {
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): NextEpisodeEdge {
  return {
    ...createEdgeDefaults(),
    ...partial,
  };
}
