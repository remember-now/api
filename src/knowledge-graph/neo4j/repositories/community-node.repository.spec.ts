import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import {
  GetByGroupIdsParamsSchema,
  SearchBySimilarityParamsSchema,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { KgNodeFactory, kgUuid } from '@/test/factories';

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
      const node = KgNodeFactory.createCommunityNode({ name: 'Community 1' });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Community'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
    });

    it('should throw before executing query when labels are invalid', async () => {
      const node = KgNodeFactory.createCommunityNode({ labels: [] });
      await expect(repo.save(node)).rejects.toThrow();
      expect(neo4j.executeWrite).not.toHaveBeenCalled();
    });

    it('should use vector property when nameEmbedding is present', async () => {
      const node = KgNodeFactory.createCommunityNode({
        name: 'Community',
        nameEmbedding: [0.1, 0.2],
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });

    it('should not use vector property when nameEmbedding is null', async () => {
      const node = KgNodeFactory.createCommunityNode({ name: 'Community' });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.not.stringContaining('setNodeVectorProperty'),
        expect.anything(),
      );
    });
  });

  describe('delete', () => {
    it('should call DETACH DELETE', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      const uuid = kgUuid();
      await repo.delete(uuid);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
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

    it('should return mapped community node when found', async () => {
      const node = KgNodeFactory.createCommunityNode();
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
          summary: node.summary,
          name_embedding: null,
          labels: ['Community'],
        },
      ]);
      const result = await repo.getByUuid(node.uuid);
      expect(result?.name).toBe('Test Community');
      expect(result?.nameEmbedding).toBeNull();
      expect(result?.labels).toEqual(['Community']);
    });
  });

  describe('getByGroupIds', () => {
    it('should query with group ids', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByGroupIds(
        GetByGroupIdsParamsSchema.parse({ groupIds: ['group-1'] }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('group_id IN $groupIds'),
        expect.objectContaining({ groupIds: ['group-1'] }),
      );
    });
  });

  describe('searchBySimilarity', () => {
    const embedding = [0.1, 0.2, 0.3];

    it('should return empty array when groupIds is empty', async () => {
      const result = await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: [],
          limit: 10,
        }),
      );
      expect(result).toEqual([]);
      expect(neo4j.executeRead).not.toHaveBeenCalled();
    });

    it('should issue one query per groupId with in-index group_id filter', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: ['g1', 'g2'],
          limit: 5,
        }),
      );
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
      const node = KgNodeFactory.createCommunityNode({ name: 'Base' });
      const rowFor = (name: string, score: number) => ({
        uuid: `uuid-${name}`,
        name,
        group_id: node.groupId,
        created_at: node.createdAt,
        summary: '',
        name_embedding: null,
        labels: ['Community'],
        score,
      });
      neo4j.executeRead
        .mockResolvedValueOnce([rowFor('A', 0.9), rowFor('B', 0.5)])
        .mockResolvedValueOnce([rowFor('C', 0.8), rowFor('D', 0.3)]);

      const results = await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: ['g1', 'g2'],
          limit: 3,
        }),
      );

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.name)).toEqual(['A', 'C', 'B']);
    });

    it('should not include group_id IN $groupIds in query', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.searchBySimilarity(
        SearchBySimilarityParamsSchema.parse({
          embedding,
          groupIds: ['g1'],
          limit: 5,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.not.stringContaining('group_id IN $groupIds'),
        expect.anything(),
      );
    });
  });
});
