import { createEdgeDefaults, EdgeBase, EdgeBaseSchema } from './edge.types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HasEpisodeEdge extends EdgeBase {}

export const HasEpisodeEdgeSchema = EdgeBaseSchema;

export function createHasEpisodeEdge(
  partial: Partial<HasEpisodeEdge> & {
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): HasEpisodeEdge {
  return {
    ...createEdgeDefaults(),
    ...partial,
  };
}
