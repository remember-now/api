import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { GetByGroupIdsWithCursorParamsSchema } from '@/knowledge-graph/neo4j/types';
import { KG_TEST_UUID_CURSOR, KgEdgeFactory, kgUuid } from '@/test/factories';

import { EpisodicEdgeRepository } from './episodic-edge.repository';

describe('EpisodicEdgeRepository', () => {
  let repo: EpisodicEdgeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  const sourceNodeUuid = kgUuid();
  const targetNodeUuid = kgUuid();

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new EpisodicEdgeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on MENTIONS and return uuid', async () => {
      const edge = KgEdgeFactory.createEpisodicEdge({
        sourceNodeUuid,
        targetNodeUuid,
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: edge.uuid }]);
      const result = await repo.save(edge);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MENTIONS'),
        expect.objectContaining({ uuid: edge.uuid }),
      );
      expect(result).toBe(edge.uuid);
    });
  });

  describe('delete', () => {
    it('should call DELETE on MENTIONS', async () => {
      const uuid = kgUuid();
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.delete(uuid);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MENTIONS'),
        expect.objectContaining({ uuid }),
      );
    });
  });

  describe('getByUuid', () => {
    it('should return null when not found', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const result = await repo.getByUuid(kgUuid());
      expect(result).toBeNull();
    });

    it('should return mapped episodic edge when found', async () => {
      const edge = KgEdgeFactory.createEpisodicEdge({
        sourceNodeUuid,
        targetNodeUuid,
      });
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: edge.uuid,
          group_id: edge.groupId,
          created_at: edge.createdAt,
          source_node_uuid: sourceNodeUuid,
          target_node_uuid: targetNodeUuid,
        },
      ]);
      const result = await repo.getByUuid(edge.uuid);
      expect(result?.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(result?.targetNodeUuid).toBe(targetNodeUuid);
    });
  });

  describe('saveBulk', () => {
    it('calls executeWrite exactly once for N edges (single UNWIND round-trip)', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      const edges = [
        KgEdgeFactory.createEpisodicEdge({ sourceNodeUuid, targetNodeUuid }),
        KgEdgeFactory.createEpisodicEdge({ sourceNodeUuid, targetNodeUuid }),
        KgEdgeFactory.createEpisodicEdge({ sourceNodeUuid, targetNodeUuid }),
      ];
      await repo.saveBulk(edges);
      expect(neo4j.executeWrite).toHaveBeenCalledTimes(1);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('UNWIND'),
        expect.anything(),
      );
    });

    it('does nothing when given an empty array', async () => {
      await repo.saveBulk([]);
      expect(neo4j.executeWrite).not.toHaveBeenCalled();
    });
  });

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsWithCursorParamsSchema.parse({ groupIds: ['group-1'] }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
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
        expect.stringContaining('e.uuid < $uuidCursor'),
        expect.objectContaining({ uuidCursor: KG_TEST_UUID_CURSOR }),
      );
    });

    it('should include ORDER BY e.uuid DESC', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsWithCursorParamsSchema.parse({
          groupIds: ['group-1'],
          limit: 10,
          uuidCursor: KG_TEST_UUID_CURSOR,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY e.uuid DESC'),
        expect.anything(),
      );
    });

    it('should not include cursor clause when uuidCursor is omitted', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsWithCursorParamsSchema.parse({ groupIds: ['group-1'] }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.not.stringContaining('$uuidCursor'),
        expect.anything(),
      );
    });
  });
});
