import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { GetByGroupIdsWithCursorParamsSchema } from '@/knowledge-graph/neo4j/types';
import {
  KG_TEST_GROUP_ID,
  KG_TEST_UUID_CURSOR,
  KgNodeFactory,
  kgUuid,
} from '@/test/factories';

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
      const node = KgNodeFactory.createSagaNode({ name: 'Saga 1' });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('MERGE (n:Saga'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
    });
  });

  describe('delete', () => {
    it('should call DETACH DELETE', async () => {
      const uuid = kgUuid();
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.delete(uuid);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuid }),
      );
    });
  });

  describe('deleteByGroupId', () => {
    it('should call DETACH DELETE with groupId', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.deleteByGroupId(KG_TEST_GROUP_ID);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
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

    it('should return mapped saga node when found', async () => {
      const node = KgNodeFactory.createSagaNode();
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
          labels: ['Saga'],
        },
      ]);
      const result = await repo.getByUuid(node.uuid);
      expect(result?.name).toBe('Test Saga');
      expect(result?.uuid).toBe(node.uuid);
      expect(result?.labels).toEqual(['Saga']);
    });
  });

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsWithCursorParamsSchema.parse({ groupIds: ['group-1'] }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('group_id IN $groupIds'),
        expect.objectContaining({ groupIds: ['group-1'] }),
      );
    });

    it('should apply uuid less-than cursor clause when uuidCursor is provided', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsWithCursorParamsSchema.parse({
          groupIds: ['group-1'],
          limit: 10,
          uuidCursor: KG_TEST_UUID_CURSOR,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('n.uuid < $uuidCursor'),
        expect.objectContaining({ uuidCursor: KG_TEST_UUID_CURSOR }),
      );
    });

    it('should include ORDER BY n.uuid DESC', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsWithCursorParamsSchema.parse({
          groupIds: ['group-1'],
          limit: 10,
          uuidCursor: KG_TEST_UUID_CURSOR,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('ORDER BY n.uuid DESC'),
        expect.anything(),
      );
    });

    it('should not include cursor clause when uuidCursor is omitted', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsWithCursorParamsSchema.parse({ groupIds: ['group-1'] }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining('$uuidCursor'),
        expect.anything(),
      );
    });
  });
});
