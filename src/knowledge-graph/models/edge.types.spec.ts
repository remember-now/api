import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID, kgUuid } from '@/test/factories';

import { RelationshipTypeSchema } from '../neo4j/types';
import {
  CommunityEdgeSchema,
  createCommunityEdge,
  createEdgeDefaults,
  createEntityEdge,
  createEpisodicEdge,
  createHasEpisodeEdge,
  createNextEpisodeEdge,
  EdgeBaseSchema,
  EntityEdgeSchema,
  EpisodicEdgeSchema,
  HasEpisodeEdgeSchema,
  NextEpisodeEdgeSchema,
} from './edge.types';

describe('edge.types', () => {
  describe('createEdgeDefaults', () => {
    it('should create defaults with a valid uuid', () => {
      const defaults = createEdgeDefaults();
      expect(defaults.uuid).toBeDefined();
      expect(defaults.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should not include groupId or node uuids in defaults', () => {
      const defaults = createEdgeDefaults();
      expect('groupId' in defaults).toBe(false);
      expect('sourceNodeUuid' in defaults).toBe(false);
      expect('targetNodeUuid' in defaults).toBe(false);
    });

    it('should create defaults with a Date for createdAt', () => {
      const defaults = createEdgeDefaults();
      expect(defaults.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('EdgeBaseSchema', () => {
    it('should accept a valid edge base', () => {
      const edge = {
        uuid: kgUuid(),
        groupId: 'group-1',
        sourceNodeUuid: kgUuid(),
        targetNodeUuid: kgUuid(),
        createdAt: new Date(),
      };
      expect(() => EdgeBaseSchema.parse(edge)).not.toThrow();
    });

    it('should reject invalid source uuid', () => {
      const edge = {
        uuid: kgUuid(),
        groupId: 'group-1',
        sourceNodeUuid: 'not-a-uuid',
        targetNodeUuid: kgUuid(),
        createdAt: new Date(),
      };
      expect(() => EdgeBaseSchema.parse(edge)).toThrow();
    });

    it('should reject invalid target uuid', () => {
      const edge = {
        uuid: kgUuid(),
        groupId: 'group-1',
        sourceNodeUuid: kgUuid(),
        targetNodeUuid: 'not-a-uuid',
        createdAt: new Date(),
      };
      expect(() => EdgeBaseSchema.parse(edge)).toThrow();
    });

    it('should reject empty groupId', () => {
      const edge = {
        uuid: kgUuid(),
        groupId: '',
        sourceNodeUuid: kgUuid(),
        targetNodeUuid: kgUuid(),
        createdAt: new Date(),
      };
      expect(() => EdgeBaseSchema.parse(edge)).toThrow();
    });
  });
});

describe('EntityEdge', () => {
  const sourceNodeUuid = kgUuid();
  const targetNodeUuid = kgUuid();

  describe('createEntityEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'A knows B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge.name).toBe('KNOWS');
      expect(edge.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(edge.targetNodeUuid).toBe(targetNodeUuid);
      expect(edge.fact).toBe('A knows B');
      expect(edge.factEmbedding).toBeNull();
      expect(edge.episodes).toEqual([]);
      expect(edge.expiredAt).toBeNull();
      expect(edge.validAt).toBeNull();
      expect(edge.invalidAt).toBeNull();
      expect(edge.attributes).toEqual({});
      expect(edge.uuid).toBeDefined();
      expect(edge.createdAt).toBeInstanceOf(Date);
    });

    it('should allow overriding fact', () => {
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'Person A knows Person B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge.fact).toBe('Person A knows Person B');
    });

    it('should allow setting factEmbedding', () => {
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'A knows B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
        factEmbedding: [0.1, 0.2, 0.3],
      });
      expect(edge.factEmbedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should allow setting dates', () => {
      const date = KG_REFERENCE_TIME;
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'A knows B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
        validAt: date,
        expiredAt: date,
        invalidAt: date,
      });
      expect(edge.validAt).toBe(date);
      expect(edge.expiredAt).toBe(date);
      expect(edge.invalidAt).toBe(date);
    });
  });

  describe('EntityEdgeSchema', () => {
    it('should accept valid entity edge', () => {
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'A knows B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EntityEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject empty name', () => {
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'A knows B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EntityEdgeSchema.parse({ ...edge, name: '' })).toThrow();
    });

    it('should reject empty groupId', () => {
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'A knows B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EntityEdgeSchema.parse({ ...edge, groupId: '' })).toThrow();
    });

    it('should accept null dates', () => {
      const edge = createEntityEdge({
        name: RelationshipTypeSchema.parse('KNOWS'),
        fact: 'A knows B',
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
        validAt: null,
        expiredAt: null,
        invalidAt: null,
      });
      expect(() => EntityEdgeSchema.parse(edge)).not.toThrow();
    });
  });
});

describe('EpisodicEdge', () => {
  const sourceNodeUuid = kgUuid();
  const targetNodeUuid = kgUuid();

  describe('createEpisodicEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createEpisodicEdge({
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

    it('should generate unique uuids', () => {
      const edge1 = createEpisodicEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      const edge2 = createEpisodicEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge1.uuid).not.toBe(edge2.uuid);
    });
  });

  describe('EpisodicEdgeSchema', () => {
    it('should accept valid episodic edge', () => {
      const edge = createEpisodicEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EpisodicEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject empty groupId', () => {
      const edge = createEpisodicEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EpisodicEdgeSchema.parse({ ...edge, groupId: '' })).toThrow();
    });

    it('should reject invalid source uuid', () => {
      const edge = createEpisodicEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() =>
        EpisodicEdgeSchema.parse({ ...edge, sourceNodeUuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});

describe('CommunityEdge', () => {
  const sourceNodeUuid = kgUuid();
  const targetNodeUuid = kgUuid();

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
      expect(() => CommunityEdgeSchema.parse({ ...edge, groupId: '' })).toThrow();
    });

    it('should reject invalid uuid', () => {
      const edge = createCommunityEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => CommunityEdgeSchema.parse({ ...edge, uuid: 'not-a-uuid' })).toThrow();
    });
  });
});

describe('HasEpisodeEdge', () => {
  const sourceNodeUuid = kgUuid();
  const targetNodeUuid = kgUuid();

  describe('createHasEpisodeEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createHasEpisodeEdge({
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

  describe('HasEpisodeEdgeSchema', () => {
    it('should accept valid has-episode edge', () => {
      const edge = createHasEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => HasEpisodeEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject empty groupId', () => {
      const edge = createHasEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => HasEpisodeEdgeSchema.parse({ ...edge, groupId: '' })).toThrow();
    });

    it('should reject invalid target uuid', () => {
      const edge = createHasEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() =>
        HasEpisodeEdgeSchema.parse({ ...edge, targetNodeUuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});

describe('NextEpisodeEdge', () => {
  const sourceNodeUuid = kgUuid();
  const targetNodeUuid = kgUuid();

  describe('createNextEpisodeEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createNextEpisodeEdge({
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

    it('should generate unique uuids', () => {
      const edge1 = createNextEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      const edge2 = createNextEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge1.uuid).not.toBe(edge2.uuid);
    });
  });

  describe('NextEpisodeEdgeSchema', () => {
    it('should accept valid next-episode edge', () => {
      const edge = createNextEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => NextEpisodeEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject empty groupId', () => {
      const edge = createNextEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => NextEpisodeEdgeSchema.parse({ ...edge, groupId: '' })).toThrow();
    });

    it('should reject invalid uuid', () => {
      const edge = createNextEpisodeEdge({
        groupId: KG_TEST_GROUP_ID,
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() =>
        NextEpisodeEdgeSchema.parse({ ...edge, uuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
