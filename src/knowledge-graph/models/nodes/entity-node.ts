import { z } from 'zod';

import { createNodeDefaults, NodeBaseSchema } from './node.types';

export const EntityNodeSchema = NodeBaseSchema.extend({
  nameEmbedding: z.array(z.number()).nullable(),
  summary: z.string(),
  attributes: z.record(z.string(), z.unknown()),
});

export type EntityNode = z.infer<typeof EntityNodeSchema>;

export function createEntityNode(
  partial: Partial<EntityNode> & { name: string; groupId: string },
): EntityNode {
  return {
    ...createNodeDefaults(),
    labels: ['Entity'],
    nameEmbedding: null,
    summary: '',
    attributes: {},
    ...partial,
  };
}
