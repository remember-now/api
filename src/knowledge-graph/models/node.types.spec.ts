import { randomUUID } from 'node:crypto';

import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID } from '@/test/factories';

import {
  EpisodeType,
  GroupIdSchema,
  NodeNameSchema,
  UuidSchema,
} from '../neo4j/neo4j.schemas';
import {
  CommunityNodeSchema,
  createCommunityNode,
  createEntityNode,
  createEpisodicNode,
  createNodeDefaults,
  createSagaNode,
  EntityNodeSchema,
  EpisodicNodeSchema,
  NodeBaseSchema,
  SagaNodeSchema,
} from './node.types';

const n = (s: string) => NodeNameSchema.parse(s);

describe('node.types', () => {
  describe('createNodeDefaults', () => {
    it('should create defaults with a valid uuid', () => {
      const defaults = createNodeDefaults();
      expect(defaults.uuid).toBeDefined();
      expect(defaults.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should create defaults with a Date for createdAt', () => {
      const defaults = createNodeDefaults();
      expect(defaults.createdAt).toBeInstanceOf(Date);
    });

    it('should default labels to empty array', () => {
      const defaults = createNodeDefaults();
      expect(defaults.labels).toEqual([]);
    });
  });

  describe('NodeBaseSchema', () => {
    it('should accept a valid node base', () => {
      const node = {
        uuid: randomUUID(),
        name: 'Test',
        groupId: 'group-1',
        labels: [],
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).not.toThrow();
    });

    it('should reject empty name', () => {
      const node = {
        uuid: randomUUID(),
        name: '',
        groupId: 'group-1',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).toThrow();
    });

    it('should reject invalid uuid', () => {
      const node = {
        uuid: 'not-a-uuid',
        name: 'Test',
        groupId: 'group-1',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).toThrow();
    });

    it('should reject empty groupId', () => {
      const node = {
        uuid: randomUUID(),
        name: 'Test',
        groupId: '',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).toThrow();
    });
  });

  describe('EpisodeType', () => {
    it('should have message, json, and text values', () => {
      expect(EpisodeType.message).toBe('message');
      expect(EpisodeType.json).toBe('json');
      expect(EpisodeType.text).toBe('text');
    });
  });
});

describe('EntityNode', () => {
  describe('createEntityNode', () => {
    it('should create with correct defaults', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node.name).toBe('Test');
      expect(node.nameEmbedding).toBeNull();
      expect(node.labels).toEqual(['Entity']);
      expect(node.summary).toBe('');
      expect(node.attributes).toEqual({});
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe(KG_TEST_GROUP_ID);
    });

    it('should allow overriding defaults', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
        summary: 'Custom summary',
      });
      expect(node.summary).toBe('Custom summary');
    });

    it('should allow setting nameEmbedding', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0.1, 0.2, 0.3],
      });
      expect(node.nameEmbedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should allow setting attributes', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
        attributes: { key: 'value' },
      });
      expect(node.attributes).toEqual({ key: 'value' });
    });

    it('should allow setting groupId', () => {
      const groupId = GroupIdSchema.parse('group-123');
      const node = createEntityNode({ name: n('Test'), groupId });

      expect(node.groupId).toBe('group-123');
    });

    it('should generate unique uuids', () => {
      const node1 = createEntityNode({
        name: n('Test1'),
        groupId: KG_TEST_GROUP_ID,
      });
      const node2 = createEntityNode({
        name: n('Test2'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node1.uuid).not.toBe(node2.uuid);
    });
  });

  describe('EntityNodeSchema', () => {
    it('should accept valid entity node', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        EntityNodeSchema.parse({
          uuid: randomUUID(),
          groupId: KG_TEST_GROUP_ID,
          createdAt: new Date(),
          labels: ['Entity'],
          nameEmbedding: null,
          summary: '',
          attributes: {},
        }),
      ).toThrow();
    });

    it('should reject empty groupId', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() => EntityNodeSchema.parse({ ...node, groupId: '' })).toThrow();
    });

    it('should reject empty name', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() => EntityNodeSchema.parse({ ...node, name: '' })).toThrow();
    });

    it('should accept null nameEmbedding', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });

    it('should accept array nameEmbedding', () => {
      const node = createEntityNode({
        name: n('Test'),
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0.1, 0.2],
      });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });
  });
});

describe('EpisodicNode', () => {
  const validAt = KG_REFERENCE_TIME;

  describe('createEpisodicNode', () => {
    it('should create with correct defaults', () => {
      const node = createEpisodicNode({
        name: n('Episode 1'),
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
        name: n('Episode'),
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
        source: EpisodeType.message,
      });
      expect(node.source).toBe(EpisodeType.message);
    });

    it('should default entityEdges to empty array', () => {
      const node = createEpisodicNode({
        name: n('Episode'),
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(node.entityEdges).toEqual([]);
    });

    it('should allow overriding entityEdges', () => {
      const uuids = [
        UuidSchema.parse('11111111-1111-4111-8111-111111111111'),
        UuidSchema.parse('22222222-2222-4222-8222-222222222222'),
      ];
      const node = createEpisodicNode({
        name: n('Episode'),
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
        name: n('Episode'),
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject invalid source enum value', () => {
      const node = createEpisodicNode({
        name: n('Episode'),
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
          name: n('Episode'),
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
        name: n('Episode'),
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should accept entityEdges with valid uuid values', () => {
      const node = createEpisodicNode({
        name: n('Episode'),
        groupId: KG_TEST_GROUP_ID,
        content: 'content',
        validAt,
        entityEdges: [
          UuidSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'),
          UuidSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc'),
        ],
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject entityEdges with non-string elements', () => {
      const node = createEpisodicNode({
        name: n('Episode'),
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
        name: n('Episode'),
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

describe('CommunityNode', () => {
  describe('createCommunityNode', () => {
    it('should create with correct defaults', () => {
      const node = createCommunityNode({
        name: n('Community 1'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node.name).toBe('Community 1');
      expect(node.nameEmbedding).toBeNull();
      expect(node.summary).toBe('');
      expect(node.labels).toEqual(['Community']);
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe(KG_TEST_GROUP_ID);
    });

    it('should allow overriding nameEmbedding', () => {
      const node = createCommunityNode({
        name: n('Community'),
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0.1, 0.2],
      });
      expect(node.nameEmbedding).toEqual([0.1, 0.2]);
    });

    it('should allow overriding summary', () => {
      const node = createCommunityNode({
        name: n('Community'),
        groupId: KG_TEST_GROUP_ID,
        summary: 'A summary',
      });
      expect(node.summary).toBe('A summary');
    });
  });

  describe('CommunityNodeSchema', () => {
    it('should accept valid community node', () => {
      const node = createCommunityNode({
        name: n('Community'),
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
        name: n('Community'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() =>
        CommunityNodeSchema.parse({ ...node, groupId: '' }),
      ).toThrow();
    });

    it('should accept null nameEmbedding', () => {
      const node = createCommunityNode({
        name: n('Community'),
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });
      expect(() => CommunityNodeSchema.parse(node)).not.toThrow();
    });
  });
});

describe('SagaNode', () => {
  describe('createSagaNode', () => {
    it('should create with correct defaults', () => {
      const node = createSagaNode({
        name: n('Saga 1'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node.name).toBe('Saga 1');
      expect(node.labels).toEqual(['Saga']);
      expect(node.uuid).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.groupId).toBe(KG_TEST_GROUP_ID);
    });

    it('should allow overriding groupId', () => {
      const groupId = GroupIdSchema.parse('group-1');
      const node = createSagaNode({ name: n('Saga'), groupId });
      expect(node.groupId).toBe('group-1');
    });

    it('should generate unique uuids', () => {
      const node1 = createSagaNode({
        name: n('Saga1'),
        groupId: KG_TEST_GROUP_ID,
      });
      const node2 = createSagaNode({
        name: n('Saga2'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(node1.uuid).not.toBe(node2.uuid);
    });
  });

  describe('SagaNodeSchema', () => {
    it('should accept valid saga node', () => {
      const node = createSagaNode({
        name: n('Saga'),
        groupId: KG_TEST_GROUP_ID,
      });
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
      const node = createSagaNode({
        name: n('Saga'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() => SagaNodeSchema.parse({ ...node, groupId: '' })).toThrow();
    });

    it('should reject invalid uuid', () => {
      const node = createSagaNode({
        name: n('Saga'),
        groupId: KG_TEST_GROUP_ID,
      });
      expect(() =>
        SagaNodeSchema.parse({ ...node, uuid: 'not-a-uuid' }),
      ).toThrow();
    });
  });
});
