import { randomUUID } from 'node:crypto';

import { KG_TEST_GROUP_ID } from '@/test/factories';

import { createSagaNode, SagaNodeSchema } from './saga-node';

describe('SagaNode', () => {
  describe('createSagaNode', () => {
    it('should create with correct defaults', () => {
      const node = createSagaNode({
        name: 'Saga 1',
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node.name).toBe('Saga 1');
      expect(node.labels).toEqual(['Saga']);
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe(KG_TEST_GROUP_ID);
    });

    it('should allow overriding groupId', () => {
      const node = createSagaNode({ name: 'Saga', groupId: 'group-1' });
      expect(node.groupId).toBe('group-1');
    });

    it('should generate unique uuids', () => {
      const node1 = createSagaNode({
        name: 'Saga1',
        groupId: KG_TEST_GROUP_ID,
      });
      const node2 = createSagaNode({
        name: 'Saga2',
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node1.uuid).not.toBe(node2.uuid);
    });
  });

  describe('SagaNodeSchema', () => {
    it('should accept valid saga node', () => {
      const node = createSagaNode({ name: 'Saga', groupId: KG_TEST_GROUP_ID });
      expect(() => SagaNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        SagaNodeSchema.parse({
          uuid: randomUUID(),
          groupId: KG_TEST_GROUP_ID,
          createdAt: new Date(),
        }),
      ).toThrow();
    });

    it('should reject empty groupId', () => {
      const node = createSagaNode({ name: 'Saga', groupId: KG_TEST_GROUP_ID });
      expect(() => SagaNodeSchema.parse({ ...node, groupId: '' })).toThrow();
    });

    it('should reject invalid uuid', () => {
      const node = createSagaNode({ name: 'Saga', groupId: KG_TEST_GROUP_ID });
      expect(() =>
        SagaNodeSchema.parse({ ...node, uuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
