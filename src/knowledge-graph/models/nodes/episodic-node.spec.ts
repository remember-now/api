import { createEpisodicNode, EpisodicNodeSchema } from './episodic-node';
import { EpisodeType } from './node.types';

describe('EpisodicNode', () => {
  const validAt = new Date('2024-01-01T00:00:00Z');

  describe('createEpisodicNode', () => {
    it('should create with correct defaults', () => {
      const node = createEpisodicNode({
        name: 'Episode 1',
        content: 'Some content',
        validAt,
      });
      expect(node.name).toBe('Episode 1');
      expect(node.content).toBe('Some content');
      expect(node.validAt).toBe(validAt);
      expect(node.source).toBe(EpisodeType.text);
      expect(node.sourceDescription).toBe('');
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe('');
    });

    it('should allow overriding source', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        content: 'content',
        validAt,
        source: EpisodeType.message,
      });
      expect(node.source).toBe(EpisodeType.message);
    });
  });

  describe('EpisodicNodeSchema', () => {
    it('should accept valid episodic node', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject invalid source enum value', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        content: 'content',
        validAt,
      });
      expect(() =>
        EpisodicNodeSchema.parse({ ...node, source: 'invalid' }),
      ).toThrow();
    });

    it('should accept all valid source types', () => {
      for (const source of Object.values(EpisodeType)) {
        const node = createEpisodicNode({
          name: 'Episode',
          content: 'content',
          validAt,
          source,
        });
        expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
      }
    });
  });
});
