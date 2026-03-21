import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { createSagaNode } from '@/knowledge-graph/models/nodes/saga-node';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { SagaNodeRepository } from './saga-node.repository';

describe('SagaNodeRepository', () => {
  let repo: SagaNodeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new SagaNodeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on Saga and return uuid', async () => {
      const node = createSagaNode({ name: 'Saga 1' });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Saga'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
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

    it('should return mapped saga node when found', async () => {
      const node = createSagaNode({ name: 'Test Saga' });
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
        },
      ]);
      const result = await repo.getByUuid(node.uuid);
      expect(result?.name).toBe('Test Saga');
      expect(result?.uuid).toBe(node.uuid);
    });
  });

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1']);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('group_id IN $groupIds'),
        expect.objectContaining({ groupIds: ['group-1'] }),
      );
    });

    it('should apply uuid less-than cursor clause when uuidCursor is provided', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1'], 10, 'cursor-uuid');
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('n.uuid < $uuidCursor'),
        expect.objectContaining({ uuidCursor: 'cursor-uuid' }),
      );
    });

    it('should include ORDER BY n.uuid DESC', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1'], 10, 'cursor-uuid');
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY n.uuid DESC'),
        expect.anything(),
      );
    });

    it('should not include cursor clause when uuidCursor is omitted', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1']);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.not.stringContaining('$uuidCursor'),
        expect.anything(),
      );
    });
  });
});
