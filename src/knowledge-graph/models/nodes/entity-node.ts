import { z } from 'zod';

import { createNodeDefaults, NodeBase, NodeBaseSchema } from './node.types';

export interface EntityNode extends NodeBase {
  labels: string[];
  nameEmbedding: number[] | null;
  summary: string;
  attributes: Record<string, unknown>;
}

export const EntityNodeSchema = NodeBaseSchema.extend({
  labels: z.array(z.string()),
  nameEmbedding: z.array(z.number()).nullable(),
  summary: z.string(),
  attributes: z.record(z.string(), z.unknown()),
});

export function createEntityNode(
  partial: Partial<EntityNode> & { name: string },
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
