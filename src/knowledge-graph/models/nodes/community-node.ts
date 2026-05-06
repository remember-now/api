import { z } from 'zod';

import { createNodeDefaults, NodeBaseSchema } from './node.types';

export const CommunityNodeSchema = NodeBaseSchema.extend({
  nameEmbedding: z.array(z.number()).nullable(),
  summary: z.string(),
});

export type CommunityNode = z.infer<typeof CommunityNodeSchema>;

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
