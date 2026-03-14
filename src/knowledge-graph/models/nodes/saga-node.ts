import { createNodeDefaults, NodeBase, NodeBaseSchema } from './node.types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SagaNode extends NodeBase {}

export const SagaNodeSchema = NodeBaseSchema;

export function createSagaNode(
  partial: Partial<SagaNode> & { name: string },
): SagaNode {
  return {
    ...createNodeDefaults(),
    ...partial,
  };
}
