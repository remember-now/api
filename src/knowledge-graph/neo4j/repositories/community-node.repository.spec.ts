import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { createCommunityNode } from '@/knowledge-graph/models/nodes/community-node';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { CommunityNodeRepository } from './community-node.repository';

describe('CommunityNodeRepository', () => {
  let repo: CommunityNodeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new CommunityNodeRepository(neo4j, mockDeep<EmbeddingService>());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on Community and return uuid', async () => {
      const node = createCommunityNode({ name: 'Community 1' });
      neo4j.runQuery.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Community'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
    });

    it('should use vector property when nameEmbedding is present', async () => {
      const node = createCommunityNode({
        name: 'Community',
        nameEmbedding: [0.1, 0.2],
      });
      neo4j.runQuery.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });

    it('should not use vector property when nameEmbedding is null', async () => {
      const node = createCommunityNode({ name: 'Community' });
      neo4j.runQuery.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
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

  describe('getByUuid', () => {
    it('should return null when not found', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      const result = await repo.getByUuid('missing');
      expect(result).toBeNull();
    });

    it('should return mapped community node when found', async () => {
      const node = createCommunityNode({ name: 'Test Community' });
      neo4j.runQuery.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
          summary: node.summary,
          name_embedding: null,
        },
      ]);
      const result = await repo.getByUuid(node.uuid);
      expect(result?.name).toBe('Test Community');
      expect(result?.nameEmbedding).toBeNull();
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
