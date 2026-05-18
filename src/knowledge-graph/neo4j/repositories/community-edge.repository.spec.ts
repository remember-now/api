import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { KgEdgeFactory, kgUuid } from '@/test/factories';

import { CommunityEdgeRepository } from './community-edge.repository';

describe('CommunityEdgeRepository', () => {
  let repo: CommunityEdgeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  const sourceNodeUuid = kgUuid();
  const targetNodeUuid = kgUuid();

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new CommunityEdgeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on HAS_MEMBER and return uuid', async () => {
      const edge = KgEdgeFactory.createCommunityEdge({
        sourceNodeUuid,
        targetNodeUuid,
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: edge.uuid }]);
      const result = await repo.save(edge);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('HAS_MEMBER'),
        expect.objectContaining({ uuid: edge.uuid }),
      );
      expect(result).toBe(edge.uuid);
    });
  });

  describe('delete', () => {
    it('should call DELETE on HAS_MEMBER', async () => {
      const uuid = kgUuid();
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.delete(uuid);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('HAS_MEMBER'),
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

    it('should return mapped community edge when found', async () => {
      const edge = KgEdgeFactory.createCommunityEdge({
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
});
