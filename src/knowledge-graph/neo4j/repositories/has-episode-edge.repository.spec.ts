import { randomUUID } from 'node:crypto';

import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { createHasEpisodeEdge } from '@/knowledge-graph/models/edges/has-episode-edge';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { HasEpisodeEdgeRepository } from './has-episode-edge.repository';

describe('HasEpisodeEdgeRepository', () => {
  let repo: HasEpisodeEdgeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new HasEpisodeEdgeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on HAS_EPISODE and return uuid', async () => {
      const edge = createHasEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
      neo4j.executeWrite.mockResolvedValue([{ uuid: edge.uuid }]);
      const result = await repo.save(edge);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('HAS_EPISODE'),
        expect.objectContaining({ uuid: edge.uuid }),
      );
      expect(result).toBe(edge.uuid);
    });
  });

  describe('delete', () => {
    it('should call DELETE on HAS_EPISODE', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.delete('test-uuid');
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('HAS_EPISODE'),
        expect.objectContaining({ uuid: 'test-uuid' }),
      );
    });
  });

  describe('getByUuid', () => {
    it('should return null when not found', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const result = await repo.getByUuid('missing');
      expect(result).toBeNull();
    });

    it('should return mapped has-episode edge when found', async () => {
      const edge = createHasEpisodeEdge({ sourceNodeUuid, targetNodeUuid });
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
        expect.stringContaining('e.uuid < $uuidCursor'),
        expect.objectContaining({ uuidCursor: 'cursor-uuid' }),
      );
    });

    it('should include ORDER BY e.uuid DESC', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(['group-1'], 10, 'cursor-uuid');
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY e.uuid DESC'),
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
