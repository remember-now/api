import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import neoDriver from 'neo4j-driver';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import {
  GetByGroupIdsParamsSchema,
  SearchBySimilarityParamsSchema,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { KG_TEST_GROUP_ID, KgNodeFactory, kgUuid } from '@/test/factories';

import { EntityNodeRepository } from './entity-node.repository';

describe('EntityNodeRepository', () => {
  let repo: EntityNodeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new EntityNodeRepository(neo4j, mockDeep<EmbeddingService>());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on Entity and return uuid', async () => {
      const node = KgNodeFactory.createEntityNode({ name: 'Test' });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Entity'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
    });

    it('should include all labels in MERGE when node has multiple labels', async () => {
      const node = KgNodeFactory.createEntityNode({
        name: 'Test',
        labels: ['Entity', 'Person'],
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Entity:Person'),
        expect.anything(),
      );
    });

    it('should use vector property call when nameEmbedding is present', async () => {
      const node = KgNodeFactory.createEntityNode({
        name: 'Test',
        nameEmbedding: [0.1, 0.2],
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });

    it('should not use vector property call when nameEmbedding is null', async () => {
      const node = KgNodeFactory.createEntityNode({
        name: 'Test',
        nameEmbedding: null,
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.not.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });
  });

  describe('saveBulk', () => {
    it('should batch nodes of the same label into a single UNWIND call', async () => {
      const nodes = [
        KgNodeFactory.createEntityNode({ name: 'Test1' }),
        KgNodeFactory.createEntityNode({ name: 'Test2' }),
      ];
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.saveBulk(nodes);
      expect(neo4j.executeWrite).toHaveBeenCalledTimes(1);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('UNWIND'),
        expect.anything(),
      );
    });

    it('should issue separate UNWIND calls per label group', async () => {
      const nodes = [
        KgNodeFactory.createEntityNode({
          name: 'Test1',
          labels: ['Entity'],
        }),
        KgNodeFactory.createEntityNode({
          name: 'Test2',
          labels: ['Entity', 'Person'],
        }),
      ];
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.saveBulk(nodes);
      expect(neo4j.executeWrite).toHaveBeenCalledTimes(2);
    });

    it('should use vector property call for nodes with embedding', async () => {
      const nodes = [
        KgNodeFactory.createEntityNode({
          name: 'Test1',
          nameEmbedding: [0.1, 0.2],
        }),
        KgNodeFactory.createEntityNode({
          name: 'Test2',
          nameEmbedding: [0.3, 0.4],
        }),
      ];
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.saveBulk(nodes);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });

    it('should return immediately for empty array', async () => {
      await repo.saveBulk([]);
      expect(neo4j.executeWrite).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should call DETACH DELETE', async () => {
      const uuid = kgUuid();
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.delete(uuid);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuid }),
      );
    });
  });

  describe('deleteByUuids', () => {
    it('should call DETACH DELETE with array of uuids', async () => {
      const uuids = [kgUuid(), kgUuid()];
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.deleteByUuids(uuids);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuids }),
      );
    });
  });

  describe('deleteByGroupId', () => {
    it('should call DETACH DELETE with groupId', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.deleteByGroupId(KG_TEST_GROUP_ID);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ groupId: KG_TEST_GROUP_ID }),
      );
    });
  });

  describe('getByUuid', () => {
    it('should return null when not found', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const result = await repo.getByUuid(kgUuid());
      expect(result).toBeNull();
    });

    it('should return mapped entity when found', async () => {
      const node = KgNodeFactory.createEntityNode({ name: 'Test' });
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
          summary: node.summary,
          attributes: JSON.stringify(node.attributes),
          name_embedding: null,
          labels: ['Entity'],
        },
      ]);
      const result = await repo.getByUuid(node.uuid);
      expect(result?.name).toBe('Test');
      expect(result?.uuid).toBe(node.uuid);
      expect(result?.nameEmbedding).toBeNull();
      expect(result?.labels).toEqual(['Entity']);
    });

    it('should query by uuid', async () => {
      const uuid = kgUuid();
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByUuid(uuid);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('uuid: $uuid'),
        expect.objectContaining({ uuid }),
      );
    });
  });

  describe('getByUuids', () => {
    it('should return empty array when no results', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const result = await repo.getByUuids([kgUuid()]);
      expect(result).toEqual([]);
    });

    it('should return mapped entities when found', async () => {
      const node = KgNodeFactory.createEntityNode({ name: 'Test' });
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
          summary: node.summary,
          attributes: JSON.stringify(node.attributes),
          name_embedding: null,
          labels: ['Entity'],
        },
      ]);
      const result = await repo.getByUuids([node.uuid]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test');
    });
  });

  describe('searchBySimilarity', () => {
    const embedding = [0.1, 0.2, 0.3];

    it('should return empty array when groupIds is empty', async () => {
      const result = await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: [],
          limit: 10,
        }),
      );
      expect(result).toEqual([]);
      expect(neo4j.executeRead).not.toHaveBeenCalled();
    });

    it('should issue one query per groupId with in-index group_id filter', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: ['g1', 'g2'],
          limit: 5,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledTimes(2);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('WHERE n.group_id = $groupId'),
        expect.objectContaining({ groupId: 'g1' }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('WHERE n.group_id = $groupId'),
        expect.objectContaining({ groupId: 'g2' }),
      );
    });

    it('should merge results from all groups, sort by score desc, and slice to limit', async () => {
      const node = KgNodeFactory.createEntityNode({ name: 'Test' });
      const rowFor = (name: string, score: number) => ({
        uuid: node.uuid + name,
        name,
        group_id: 'g1',
        created_at: node.createdAt,
        summary: '',
        attributes: JSON.stringify({}),
        name_embedding: null,
        labels: ['Entity'],
        score,
      });
      neo4j.executeRead
        .mockResolvedValueOnce([rowFor('A', 0.9), rowFor('B', 0.5)])
        .mockResolvedValueOnce([rowFor('C', 0.8), rowFor('D', 0.3)]);

      const results = await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: ['g1', 'g2'],
          limit: 3,
        }),
      );

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.name)).toEqual(['A', 'C', 'B']);
    });

    it('should not include group_id IN $groupIds in query', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: ['g1'],
          limit: 5,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.not.stringContaining('group_id IN $groupIds'),
        expect.anything(),
      );
    });
  });

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsParamsSchema.parse({ groupIds: ['group-1', 'group-2'] }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('group_id IN $groupIds'),
        expect.objectContaining({ groupIds: ['group-1', 'group-2'] }),
      );
    });

    it('should include LIMIT $limit clause and pass limit as parameter', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsParamsSchema.parse({ groupIds: ['group-1'], limit: 10 }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $limit'),
        expect.objectContaining({ limit: neoDriver.int(10) }),
      );
    });
  });

  describe('getNodeDistanceScores', () => {
    it('should call executeRead with RELATES_TO match and correct params', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const nodeUuids = [kgUuid(), kgUuid()];
      const centerUuid = kgUuid();
      await repo.getNodeDistanceScores(nodeUuids, centerUuid);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('RELATES_TO'),
        { nodeUuids, centerUuid },
      );
    });
  });

  describe('getEpisodeMentionCounts', () => {
    it('should call executeRead with MENTIONS match and correct params', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const nodeUuids = [kgUuid(), kgUuid()];
      await repo.getEpisodeMentionCounts(nodeUuids);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('MENTIONS'),
        { nodeUuids },
      );
    });
  });
});
