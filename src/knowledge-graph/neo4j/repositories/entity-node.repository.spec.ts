import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { ZodError } from 'zod';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { createEntityNode } from '@/knowledge-graph/models/nodes/entity-node';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

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
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Entity'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
    });

    it('should include all labels in MERGE when node has multiple labels', async () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
        labels: ['Entity', 'Person'],
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Entity:Person'),
        expect.anything(),
      );
    });

    it('should throw ZodError for unsafe label', async () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
        labels: ['Entity) WITH n MATCH (x'],
      });
      await expect(repo.save(node)).rejects.toBeInstanceOf(ZodError);
      expect(neo4j.executeWrite).not.toHaveBeenCalled();
    });

    it('should use vector property call when nameEmbedding is present', async () => {
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
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
      const node = createEntityNode({
        name: 'Test',
        groupId: 'test-group',
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
        createEntityNode({ name: 'Test1', groupId: 'test-group' }),
        createEntityNode({ name: 'Test2', groupId: 'test-group' }),
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
        createEntityNode({
          name: 'Test1',
          groupId: 'test-group',
          labels: ['Entity'],
        }),
        createEntityNode({
          name: 'Test2',
          groupId: 'test-group',
          labels: ['Entity', 'Person'],
        }),
      ];
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.saveBulk(nodes);
      expect(neo4j.executeWrite).toHaveBeenCalledTimes(2);
    });

    it('should use vector property call for nodes with embedding', async () => {
      const nodes = [
        createEntityNode({
          name: 'Test1',
          groupId: 'test-group',
          nameEmbedding: [0.1, 0.2],
        }),
        createEntityNode({
          name: 'Test2',
          groupId: 'test-group',
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
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.delete('test-uuid');
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuid: 'test-uuid' }),
      );
    });
  });

  describe('deleteByUuids', () => {
    it('should call DETACH DELETE with array of uuids', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.deleteByUuids(['uuid-1', 'uuid-2']);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuids: ['uuid-1', 'uuid-2'] }),
      );
    });
  });

  describe('deleteByGroupId', () => {
    it('should call DETACH DELETE with groupId', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.deleteByGroupId('group-1');
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ groupId: 'group-1' }),
      );
    });
  });

  describe('getByUuid', () => {
    it('should return null when not found', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const result = await repo.getByUuid('missing');
      expect(result).toBeNull();
    });

    it('should return mapped entity when found', async () => {
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
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
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByUuid('some-uuid');
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('uuid: $uuid'),
        expect.objectContaining({ uuid: 'some-uuid' }),
      );
    });
  });

  describe('getByUuids', () => {
    it('should return empty array when no results', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const result = await repo.getByUuids(['uuid-1']);
      expect(result).toEqual([]);
    });

    it('should return mapped entities when found', async () => {
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
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
      const result = await repo.searchBySimilarity(embedding, [], 10);
      expect(result).toEqual([]);
      expect(neo4j.executeRead).not.toHaveBeenCalled();
    });

    it('should issue one query per groupId with in-index group_id filter', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.searchBySimilarity(embedding, ['g1', 'g2'], 5);
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
      const node = createEntityNode({ name: 'Test', groupId: 'test-group' });
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

      const results = await repo.searchBySimilarity(embedding, ['g1', 'g2'], 3);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.name)).toEqual(['A', 'C', 'B']);
    });

    it('should not include group_id IN $groupIds in query', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.searchBySimilarity(embedding, ['g1'], 5);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.not.stringContaining('group_id IN $groupIds'),
        expect.anything(),
      );
    });
  });

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1', 'group-2']);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('group_id IN $groupIds'),
        expect.objectContaining({ groupIds: ['group-1', 'group-2'] }),
      );
    });

    it('should include LIMIT $limit clause and pass limit as parameter', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1'], 10);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $limit'),
        expect.objectContaining({ limit: 10 }),
      );
    });
  });
});
