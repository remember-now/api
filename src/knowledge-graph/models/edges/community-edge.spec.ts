import { randomUUID } from 'node:crypto';

import { KG_TEST_GROUP_ID } from '@/test/factories';

import { CommunityEdgeSchema, createCommunityEdge } from './community-edge';

describe('CommunityEdge', () => {
  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  describe('createCommunityEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createCommunityEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(edge.targetNodeUuid).toBe(targetNodeUuid);
      expect(edge.uuid).toBeDefined();
      expect(edge.createdAt).toBeInstanceOf(Date);
      expect(edge.groupId).toBe(KG_TEST_GROUP_ID);
    });
  });

  describe('CommunityEdgeSchema', () => {
    it('should accept valid community edge', () => {
      const edge = createCommunityEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => CommunityEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject empty groupId', () => {
      const edge = createCommunityEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() =>
        CommunityEdgeSchema.parse({ ...edge, groupId: '' }),
      ).toThrow();
    });

    it('should reject invalid uuid', () => {
      const edge = createCommunityEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() =>
        CommunityEdgeSchema.parse({ ...edge, uuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
