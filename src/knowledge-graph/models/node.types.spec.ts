import { randomUUID } from 'node:crypto';

import { UuidSchema } from '@/common/schemas';
import { kgId as _kgId, KG_REFERENCE_TIME, KG_TEST_GRAPH_ID } from '@/test/factories';

import { EpisodeType, NodeNameSchema } from '../types';
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
    it('should create defaults with a valid id', () => {
      const defaults = createNodeDefaults();
      expect(defaults.id).toBeDefined();
      expect(defaults.id).toMatch(
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
        id: randomUUID(),
        name: 'Test',
        graphId: KG_TEST_GRAPH_ID,
        labels: [],
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).not.toThrow();
    });

    it('should reject empty name', () => {
      const node = {
        id: randomUUID(),
        name: '',
        graphId: 'group-1',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).toThrow();
    });

    it('should reject invalid id', () => {
      const node = {
        id: 'not-a-uuid',
        name: 'Test',
        graphId: 'group-1',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).toThrow();
    });

    it('should reject empty graphId', () => {
      const node = {
        id: randomUUID(),
        name: 'Test',
        graphId: '',
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
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(node.name).toBe('Test');
      expect(node.nameEmbedding).toBeNull();
      expect(node.labels).toEqual(['Entity']);
      expect(node.summary).toBe('');
      expect(node.attributes).toEqual({});
      expect(node.id).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.graphId).toBe(KG_TEST_GRAPH_ID);
    });

    it('should allow overriding defaults', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
        summary: 'Custom summary',
      });
      expect(node.summary).toBe('Custom summary');
    });

    it('should allow setting nameEmbedding', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
        nameEmbedding: [0.1, 0.2, 0.3],
      });
      expect(node.nameEmbedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should allow setting attributes', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
        attributes: { key: 'value' },
      });
      expect(node.attributes).toEqual({ key: 'value' });
    });

    it('should allow setting graphId', () => {
      const graphId = UuidSchema.parse('00000000-0000-4000-8000-000000000123');
      const node = createEntityNode({ name: n('Test'), graphId });

      expect(node.graphId).toBe('00000000-0000-4000-8000-000000000123');
    });

    it('should generate unique ids', () => {
      const node1 = createEntityNode({
        name: n('Test1'),
        graphId: KG_TEST_GRAPH_ID,
      });
      const node2 = createEntityNode({
        name: n('Test2'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(node1.id).not.toBe(node2.id);
    });
  });

  describe('EntityNodeSchema', () => {
    it('should accept valid entity node', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        EntityNodeSchema.parse({
          id: randomUUID(),
          graphId: KG_TEST_GRAPH_ID,
          createdAt: new Date(),
          labels: ['Entity'],
          nameEmbedding: null,
          summary: '',
          attributes: {},
        }),
      ).toThrow();
    });

    it('should reject empty graphId', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => EntityNodeSchema.parse({ ...node, graphId: '' })).toThrow();
    });

    it('should reject empty name', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => EntityNodeSchema.parse({ ...node, name: '' })).toThrow();
    });

    it('should accept null nameEmbedding', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
        nameEmbedding: null,
      });
      expect(() => EntityNodeSchema.parse(node)).not.toThrow();
    });

    it('should accept array nameEmbedding', () => {
      const node = createEntityNode({
        name: n('Test'),
        graphId: KG_TEST_GRAPH_ID,
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
        graphId: KG_TEST_GRAPH_ID,
        content: 'Some content',
        validAt,
      });
      expect(node.name).toBe('Episode 1');
      expect(node.content).toBe('Some content');
      expect(node.validAt).toBe(validAt);
      expect(node.source).toBe(EpisodeType.text);
      expect(node.sourceDescription).toBe('');
      expect(node.labels).toEqual(['Episodic']);
      expect(node.id).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.graphId).toBe(KG_TEST_GRAPH_ID);
    });

    it('should allow overriding source', () => {
      const node = createEpisodicNode({
        name: n('Episode'),
        graphId: KG_TEST_GRAPH_ID,
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
        name: n('Episode'),
        graphId: KG_TEST_GRAPH_ID,
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject invalid source enum value', () => {
      const node = createEpisodicNode({
        name: n('Episode'),
        graphId: KG_TEST_GRAPH_ID,
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse({ ...node, source: 'invalid' })).toThrow();
    });

    it('should accept all valid source types', () => {
      for (const source of Object.values(EpisodeType)) {
        const node = createEpisodicNode({
          name: n('Episode'),
          graphId: KG_TEST_GRAPH_ID,
          content: 'content',
          validAt,
          source,
        });
        expect(() => EpisodicNodeSchema.parse(node)).not.toThrow();
      }
    });

    it('should reject empty graphId', () => {
      const node = createEpisodicNode({
        name: n('Episode'),
        graphId: KG_TEST_GRAPH_ID,
        content: 'content',
        validAt,
      });
      expect(() => EpisodicNodeSchema.parse({ ...node, graphId: '' })).toThrow();
    });
  });
});

describe('CommunityNode', () => {
  describe('createCommunityNode', () => {
    it('should create with correct defaults', () => {
      const node = createCommunityNode({
        name: n('Community 1'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(node.name).toBe('Community 1');
      expect(node.nameEmbedding).toBeNull();
      expect(node.summary).toBe('');
      expect(node.labels).toEqual(['Community']);
      expect(node.id).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.graphId).toBe(KG_TEST_GRAPH_ID);
    });

    it('should allow overriding nameEmbedding', () => {
      const node = createCommunityNode({
        name: n('Community'),
        graphId: KG_TEST_GRAPH_ID,
        nameEmbedding: [0.1, 0.2],
      });
      expect(node.nameEmbedding).toEqual([0.1, 0.2]);
    });

    it('should allow overriding summary', () => {
      const node = createCommunityNode({
        name: n('Community'),
        graphId: KG_TEST_GRAPH_ID,
        summary: 'A summary',
      });
      expect(node.summary).toBe('A summary');
    });
  });

  describe('CommunityNodeSchema', () => {
    it('should accept valid community node', () => {
      const node = createCommunityNode({
        name: n('Community'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => CommunityNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        CommunityNodeSchema.parse({
          id: randomUUID(),
          graphId: KG_TEST_GRAPH_ID,
          createdAt: new Date(),
          nameEmbedding: null,
          summary: '',
        }),
      ).toThrow();
    });

    it('should reject empty graphId', () => {
      const node = createCommunityNode({
        name: n('Community'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => CommunityNodeSchema.parse({ ...node, graphId: '' })).toThrow();
    });

    it('should accept null nameEmbedding', () => {
      const node = createCommunityNode({
        name: n('Community'),
        graphId: KG_TEST_GRAPH_ID,
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
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(node.name).toBe('Saga 1');
      expect(node.labels).toEqual(['Saga']);
      expect(node.id).toBeDefined();
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.graphId).toBe(KG_TEST_GRAPH_ID);
    });

    it('should allow overriding graphId', () => {
      const graphId = UuidSchema.parse('00000000-0000-4000-8000-000000000001');
      const node = createSagaNode({ name: n('Saga'), graphId });
      expect(node.graphId).toBe('00000000-0000-4000-8000-000000000001');
    });

    it('should generate unique ids', () => {
      const node1 = createSagaNode({
        name: n('Saga1'),
        graphId: KG_TEST_GRAPH_ID,
      });
      const node2 = createSagaNode({
        name: n('Saga2'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(node1.id).not.toBe(node2.id);
    });
  });

  describe('SagaNodeSchema', () => {
    it('should accept valid saga node', () => {
      const node = createSagaNode({
        name: n('Saga'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => SagaNodeSchema.parse(node)).not.toThrow();
    });

    it('should reject missing name', () => {
      expect(() =>
        SagaNodeSchema.parse({
          id: randomUUID(),
          graphId: KG_TEST_GRAPH_ID,
          createdAt: new Date(),
        }),
      ).toThrow();
    });

    it('should reject empty graphId', () => {
      const node = createSagaNode({
        name: n('Saga'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => SagaNodeSchema.parse({ ...node, graphId: '' })).toThrow();
    });

    it('should reject invalid id', () => {
      const node = createSagaNode({
        name: n('Saga'),
        graphId: KG_TEST_GRAPH_ID,
      });
      expect(() => SagaNodeSchema.parse({ ...node, id: 'not-a-uuid' })).toThrow();
    });
  });
});
