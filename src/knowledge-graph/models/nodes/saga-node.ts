import { z } from 'zod';

import { createNodeDefaults, NodeBaseSchema } from './node.types';

export const SagaNodeSchema = NodeBaseSchema;

export type SagaNode = z.infer<typeof SagaNodeSchema>;

export function createSagaNode(
  partial: Partial<SagaNode> & { name: string; groupId: string },
): SagaNode {
  return {
    ...createNodeDefaults(),
    labels: ['Saga'],
    ...partial,
  };
}
