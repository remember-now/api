import { randomUUID } from 'node:crypto';

import { createSagaNode, SagaNodeSchema } from './saga-node';

describe('SagaNode', () => {
  describe('createSagaNode', () => {
    it('should create with correct defaults', () => {
      const node = createSagaNode({ name: 'Saga 1', groupId: 'test-group' });
      expect(node.name).toBe('Saga 1');
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe('test-group');
    });

    it('should allow overriding groupId', () => {
      const node = createSagaNode({ name: 'Saga', groupId: 'group-1' });
      expect(node.groupId).toBe('group-1');
    });

    it('should generate unique uuids', () => {
      const node1 = createSagaNode({ name: 'Saga1', groupId: 'test-group' });
      const node2 = createSagaNode({ name: 'Saga2', groupId: 'test-group' });
      expect(node1.uuid).not.toBe(node2.uuid);
    });
  });

  describe('SagaNodeSchema', () => {
    it('should accept valid saga node', () => {
      const node = createSagaNode({ name: 'Saga', groupId: 'test-group' });
      expect(() => SagaNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        SagaNodeSchema.parse({
          uuid: randomUUID(),
          groupId: 'test-group',
          createdAt: new Date(),
        }),
      ).toThrow();
    });

    it('should reject empty groupId', () => {
      const node = createSagaNode({ name: 'Saga', groupId: 'test-group' });
      expect(() => SagaNodeSchema.parse({ ...node, groupId: '' })).toThrow();
    });

    it('should reject invalid uuid', () => {
      const node = createSagaNode({ name: 'Saga', groupId: 'test-group' });
      expect(() =>
        SagaNodeSchema.parse({ ...node, uuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
