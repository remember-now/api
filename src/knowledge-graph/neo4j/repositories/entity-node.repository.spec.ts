import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { createEntityNode } from '@/knowledge-graph/models/nodes/entity-node';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { EntityNodeRepository } from './entity-node.repository';

describe('EntityNodeRepository', () => {
  let repo: EntityNodeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new EntityNodeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on Entity and return uuid', async () => {
      const node = createEntityNode({ name: 'Test' });
      neo4j.runQuery.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Entity'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
    });

    it('should use vector property call when nameEmbedding is present', async () => {
      const node = createEntityNode({
        name: 'Test',
        nameEmbedding: [0.1, 0.2],
      });
      neo4j.runQuery.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });

    it('should not use vector property call when nameEmbedding is null', async () => {
      const node = createEntityNode({ name: 'Test', nameEmbedding: null });
      neo4j.runQuery.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });
  });

  describe('saveBulk', () => {
    it('should call save for each node', async () => {
      const nodes = [
        createEntityNode({ name: 'Test1' }),
        createEntityNode({ name: 'Test2' }),
      ];
      neo4j.runQuery.mockResolvedValue([{ uuid: 'some-uuid' }]);
      await repo.saveBulk(nodes);
      expect(neo4j.runQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('should call DETACH DELETE', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.delete('test-uuid');
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuid: 'test-uuid' }),
      );
    });
  });

  describe('deleteByUuids', () => {
    it('should call DETACH DELETE with array of uuids', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.deleteByUuids(['uuid-1', 'uuid-2']);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuids: ['uuid-1', 'uuid-2'] }),
      );
    });
  });

  describe('deleteByGroupId', () => {
    it('should call DETACH DELETE with groupId', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.deleteByGroupId('group-1');
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ groupId: 'group-1' }),
      );
    });
  });

  describe('getByUuid', () => {
    it('should return null when not found', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      const result = await repo.getByUuid('missing');
      expect(result).toBeNull();
    });

    it('should return mapped entity when found', async () => {
      const node = createEntityNode({ name: 'Test' });
      neo4j.runQuery.mockResolvedValue([
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
      neo4j.runQuery.mockResolvedValue([]);
      await repo.getByUuid('some-uuid');
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('uuid: $uuid'),
        expect.objectContaining({ uuid: 'some-uuid' }),
      );
    });
  });

  describe('getByUuids', () => {
    it('should return empty array when no results', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      const result = await repo.getByUuids(['uuid-1']);
      expect(result).toEqual([]);
    });

    it('should return mapped entities when found', async () => {
      const node = createEntityNode({ name: 'Test' });
      neo4j.runQuery.mockResolvedValue([
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

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1', 'group-2']);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('group_id IN $groupIds'),
        expect.objectContaining({ groupIds: ['group-1', 'group-2'] }),
      );
    });

    it('should include LIMIT clause when limit is provided', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1'], 10);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10'),
        expect.anything(),
      );
    });

    it('should include cursor clause when uuidCursor is provided', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1'], undefined, 'cursor-uuid');
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('uuid > $uuidCursor'),
        expect.objectContaining({ uuidCursor: 'cursor-uuid' }),
      );
    });
  });
});
