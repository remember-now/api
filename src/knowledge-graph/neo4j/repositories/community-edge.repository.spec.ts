import { randomUUID } from 'node:crypto';

import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { createCommunityEdge } from '@/knowledge-graph/models/edges/community-edge';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { CommunityEdgeRepository } from './community-edge.repository';

describe('CommunityEdgeRepository', () => {
  let repo: CommunityEdgeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new CommunityEdgeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on HAS_MEMBER and return uuid', async () => {
      const edge = createCommunityEdge({ sourceNodeUuid, targetNodeUuid });
      neo4j.runQuery.mockResolvedValue([{ uuid: edge.uuid }]);
      const result = await repo.save(edge);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('HAS_MEMBER'),
        expect.objectContaining({ uuid: edge.uuid }),
      );
      expect(result).toBe(edge.uuid);
    });
  });

  describe('delete', () => {
    it('should call DELETE on HAS_MEMBER', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.delete('test-uuid');
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('HAS_MEMBER'),
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

    it('should return mapped community edge when found', async () => {
      const edge = createCommunityEdge({ sourceNodeUuid, targetNodeUuid });
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
});
