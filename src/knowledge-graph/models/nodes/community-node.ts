import { z } from 'zod';

import { createNodeDefaults, NodeBase, NodeBaseSchema } from './node.types';

export interface CommunityNode extends NodeBase {
  nameEmbedding: number[] | null;
  summary: string;
}

export const CommunityNodeSchema = NodeBaseSchema.extend({
  nameEmbedding: z.array(z.number()).nullable(),
  summary: z.string(),
});

export function createCommunityNode(
  partial: Partial<CommunityNode> & { name: string; groupId: string },
): CommunityNode {
  return {
    ...createNodeDefaults(),
    labels: ['Community'],
    nameEmbedding: null,
    summary: '',
    ...partial,
  };
}
