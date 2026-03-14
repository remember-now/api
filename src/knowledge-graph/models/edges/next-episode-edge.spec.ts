import { randomUUID } from 'node:crypto';

import {
  createNextEpisodeEdge,
  NextEpisodeEdgeSchema,
} from './next-episode-edge';

describe('NextEpisodeEdge', () => {
  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  describe('createNextEpisodeEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createNextEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      expect(edge.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(edge.targetNodeUuid).toBe(targetNodeUuid);
      expect(edge.uuid).toBeDefined();
      expect(edge.createdAt).toBeInstanceOf(Date);
      expect(edge.groupId).toBe('');
    });

    it('should generate unique uuids', () => {
      const edge1 = createNextEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      const edge2 = createNextEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      expect(edge1.uuid).not.toBe(edge2.uuid);
    });
  });

  describe('NextEpisodeEdgeSchema', () => {
    it('should accept valid next-episode edge', () => {
      const edge = createNextEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      expect(() => NextEpisodeEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject invalid uuid', () => {
      const edge = createNextEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      expect(() =>
        NextEpisodeEdgeSchema.parse({ ...edge, uuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
