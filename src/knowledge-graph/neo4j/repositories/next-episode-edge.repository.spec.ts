import { randomUUID } from 'node:crypto';

import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { createNextEpisodeEdge } from '@/knowledge-graph/models/edges/next-episode-edge';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { NextEpisodeEdgeRepository } from './next-episode-edge.repository';

describe('NextEpisodeEdgeRepository', () => {
  let repo: NextEpisodeEdgeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new NextEpisodeEdgeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on NEXT_EPISODE and return uuid', async () => {
      const edge = createNextEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      neo4j.runQuery.mockResolvedValue([{ uuid: edge.uuid }]);
      const result = await repo.save(edge);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('NEXT_EPISODE'),
        expect.objectContaining({ uuid: edge.uuid }),
      );
      expect(result).toBe(edge.uuid);
    });
  });

  describe('delete', () => {
    it('should call DELETE on NEXT_EPISODE', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.delete('test-uuid');
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('NEXT_EPISODE'),
        expect.objectContaining({ uuid: 'test-uuid' }),
      );
    });
  });

  describe('getByUuid', () => {
    it('should return null when not found', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      const result = await repo.getByUuid('missing');
      expect(result).toBeNull();
    });

    it('should return mapped next-episode edge when found', async () => {
      const edge = createNextEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      neo4j.runQuery.mockResolvedValue([
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

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1']);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('group_id IN $groupIds'),
        expect.objectContaining({ groupIds: ['group-1'] }),
      );
    });
  });
});
