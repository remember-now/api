import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID } from '@/test/factories';

import { createEpisodicNode, EpisodicNodeSchema } from './episodic-node';
import { EpisodeType } from './node.types';

describe('EpisodicNode', () => {
  const validAt = KG_REFERENCE_TIME;

  describe('createEpisodicNode', () => {
    it('should create with correct defaults', () => {
      const node = createEpisodicNode({
        name: 'Episode 1',
        groupId: KG_TEST_GROUP_ID,
        content: 'Some content',
        validAt,
      });
      expect(node.name).toBe('Episode 1');
      expect(node.content).toBe('Some content');
      expect(node.validAt).toBe(validAt);
      expect(node.source).toBe(EpisodeType.text);
      expect(node.sourceDescription).toBe('');
      expect(node.labels).toEqual(['Episodic']);
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe(KG_TEST_GROUP_ID);
    });

    it('should allow overriding source', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
        source: EpisodeType.message,
      });
      expect(node.source).toBe(EpisodeType.message);
    });

    it('should default entityEdges to empty array', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(node.entityEdges).toEqual([]);
    });

    it('should allow overriding entityEdges', () => {
      const uuids = ['uuid-1', 'uuid-2'];
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
        entityEdges: uuids,
      });
      expect(node.entityEdges).toEqual(uuids);
    });
  });

  describe('EpisodicNodeSchema', () => {
    it('should accept valid episodic node', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject invalid source enum value', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
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
          groupId: KG_TEST_GROUP_ID,
          content: 'content',
          validAt,
          source,
        });
        expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
      }
    });

    it('should accept empty entityEdges array', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should accept entityEdges with string uuid values', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
        entityEdges: ['uuid-a', 'uuid-b'],
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject entityEdges with non-string elements', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(() =>
        EpisodicNodeSchema.parse({ ...node, entityEdges: [123] }),
      ).toThrow();
    });

    it('should reject empty groupId', () => {
      const node = createEpisodicNode({
        name: 'Episode',
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(() =>
        EpisodicNodeSchema.parse({ ...node, groupId: '' }),
      ).toThrow();
    });
  });
});
