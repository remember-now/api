import { createEdgeDefaults, EdgeBase, EdgeBaseSchema } from './edge.types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CommunityEdge extends EdgeBase {}

export const CommunityEdgeSchema = EdgeBaseSchema;

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
