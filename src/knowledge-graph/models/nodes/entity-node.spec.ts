import { randomUUID } from 'node:crypto';

import { createEntityNode, EntityNodeSchema } from './entity-node';

describe('EntityNode', () => {
  describe('createEntityNode', () => {
    it('should create with correct defaults', () => {
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
      expect(node.name).toBe('Test');
      expect(node.nameEmbedding).toBeNull();
      expect(node.labels).toEqual(['Entity']);
      expect(node.summary).toBe('');
      expect(node.attributes).toEqual({});
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe('test-group');
    });

    it('should allow overriding defaults', () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
        summary: 'Custom summary',
      });
      expect(node.summary).toBe('Custom summary');
    });

    it('should allow setting nameEmbedding', () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
        nameEmbedding: [0.1, 0.2, 0.3],
      });
      expect(node.nameEmbedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should allow setting attributes', () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
        attributes: { key: 'value' },
      });
      expect(node.attributes).toEqual({ key: 'value' });
    });

    it('should allow setting groupId', () => {
      const node = createEntityNode({ name: 'Test', groupId: 'group-123' });

      expect(node.groupId).toBe('group-123');
    });

    it('should generate unique uuids', () => {
      const node1 = createEntityNode({ name: 'Test1', groupId: 'test-group' });
      const node2 = createEntityNode({ name: 'Test2', groupId: 'test-group' });
      expect(node1.uuid).not.toBe(node2.uuid);
    });
  });

  describe('EntityNodeSchema', () => {
    it('should accept valid entity node', () => {
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        EntityNodeSchema.parse({
          uuid: randomUUID(),
          groupId: 'test-group',
          createdAt: new Date(),
          labels: ['Entity'],
          nameEmbedding: null,
          summary: '',
          attributes: {},
        }),
      ).toThrow();
    });

    it('should reject empty groupId', () => {
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
      expect(() => EntityNodeSchema.parse({ ...node, groupId: '' })).toThrow();
    });

    it('should reject empty name', () => {
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
      expect(() => EntityNodeSchema.parse({ ...node, name: '' })).toThrow();
    });

    it('should accept null nameEmbedding', () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
        nameEmbedding: null,
      });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });

    it('should accept array nameEmbedding', () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
        nameEmbedding: [0.1, 0.2],
      });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });
  });
});
