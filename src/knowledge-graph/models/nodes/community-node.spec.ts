import { randomUUID } from 'node:crypto';

import { KG_TEST_GROUP_ID } from '@/test/factories';

import { CommunityNodeSchema, createCommunityNode } from './community-node';

describe('CommunityNode', () => {
  describe('createCommunityNode', () => {
    it('should create with correct defaults', () => {
      const node = createCommunityNode({
        name: 'Community 1',
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node.name).toBe('Community 1');
      expect(node.nameEmbedding).toBeNull();
      expect(node.summary).toBe('');
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe(KG_TEST_GROUP_ID);
    });

    it('should allow overriding nameEmbedding', () => {
      const node = createCommunityNode({
        name: 'Community',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0.1, 0.2],
      });
      expect(node.nameEmbedding).toEqual([0.1, 0.2]);
    });

    it('should allow overriding summary', () => {
      const node = createCommunityNode({
        name: 'Community',
        groupId: KG_TEST_GROUP_ID,
        summary: 'A summary',
      });
      expect(node.summary).toBe('A summary');
    });
  });

  describe('CommunityNodeSchema', () => {
    it('should accept valid community node', () => {
      const node = createCommunityNode({
        name: 'Community',
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() => CommunityNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        CommunityNodeSchema.parse({
          uuid: randomUUID(),
          groupId: KG_TEST_GROUP_ID,
          createdAt: new Date(),
          nameEmbedding: null,
          summary: '',
        }),
      ).toThrow();
    });

    it('should reject empty groupId', () => {
      const node = createCommunityNode({
        name: 'Community',
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() =>
        CommunityNodeSchema.parse({ ...node, groupId: '' }),
      ).toThrow();
    });

    it('should accept null nameEmbedding', () => {
      const node = createCommunityNode({
        name: 'Community',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });
      expect(() => CommunityNodeSchema.parse(node)).not.toThrow();
    });
  });
});
