import { randomUUID } from 'node:crypto';

import { createHasEpisodeEdge, HasEpisodeEdgeSchema } from './has-episode-edge';

describe('HasEpisodeEdge', () => {
  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  describe('createHasEpisodeEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createHasEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      expect(edge.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(edge.targetNodeUuid).toBe(targetNodeUuid);
      expect(edge.uuid).toBeDefined();
      expect(edge.createdAt).toBeInstanceOf(Date);
      expect(edge.groupId).toBe('');
    });
  });

  describe('HasEpisodeEdgeSchema', () => {
    it('should accept valid has-episode edge', () => {
      const edge = createHasEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      expect(() => HasEpisodeEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject invalid target uuid', () => {
      const edge = createHasEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      expect(() =>
        HasEpisodeEdgeSchema.parse({ ...edge, targetNodeUuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
