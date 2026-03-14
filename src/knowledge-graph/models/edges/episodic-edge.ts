import { createEdgeDefaults, EdgeBase, EdgeBaseSchema } from './edge.types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EpisodicEdge extends EdgeBase {}

export const EpisodicEdgeSchema = EdgeBaseSchema;

export function createEpisodicEdge(
  partial: Partial<EpisodicEdge> & {
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): EpisodicEdge {
  return {
    ...createEdgeDefaults(),
    ...partial,
  };
}
