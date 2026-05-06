import { randomUUID } from 'node:crypto';

import { createEpisodicEdge, EpisodicEdgeSchema } from './episodic-edge';

describe('EpisodicEdge', () => {
  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  describe('createEpisodicEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createEpisodicEdge({
        groupId: 'test-group',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(edge.targetNodeUuid).toBe(targetNodeUuid);
      expect(edge.uuid).toBeDefined();
      expect(edge.createdAt).toBeInstanceOf(Date);
      expect(edge.groupId).toBe('test-group');
    });

    it('should generate unique uuids', () => {
      const edge1 = createEpisodicEdge({
        groupId: 'test-group',
        sourceNodeUuid,
        targetNodeUuid,
      });
      const edge2 = createEpisodicEdge({
        groupId: 'test-group',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge1.uuid).not.toBe(edge2.uuid);
    });
  });

  describe('EpisodicEdgeSchema', () => {
    it('should accept valid episodic edge', () => {
      const edge = createEpisodicEdge({
        groupId: 'test-group',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EpisodicEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject empty groupId', () => {
      const edge = createEpisodicEdge({
        groupId: 'test-group',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() =>
        EpisodicEdgeSchema.parse({ ...edge, groupId: '' }),
      ).toThrow();
    });

    it('should reject invalid source uuid', () => {
      const edge = createEpisodicEdge({
        groupId: 'test-group',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() =>
        EpisodicEdgeSchema.parse({ ...edge, sourceNodeUuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
