import { randomUUID } from 'node:crypto';

import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { createEntityEdge } from '@/knowledge-graph/models/edges/entity-edge';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { EntityEdgeRepository } from './entity-edge.repository';

describe('EntityEdgeRepository', () => {
  let repo: EntityEdgeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new EntityEdgeRepository(neo4j, mockDeep<EmbeddingService>());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on RELATES_TO and return uuid', async () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: edge.uuid }]);
      const result = await repo.save(edge);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('RELATES_TO'),
        expect.objectContaining({ uuid: edge.uuid }),
      );
      expect(result).toBe(edge.uuid);
    });

    it('should use vector property when factEmbedding is present', async () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
        factEmbedding: [0.1, 0.2],
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: edge.uuid }]);
      await repo.save(edge);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('setRelationshipVectorProperty'),
        expect.anything(),
      );
    });

    it('should not use vector property when factEmbedding is null', async () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: edge.uuid }]);
      await repo.save(edge);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.not.stringContaining('setRelationshipVectorProperty'),
        expect.anything(),
      );
    });
  });

  describe('delete', () => {
    it('should call DELETE on RELATES_TO', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.delete('test-uuid');
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('RELATES_TO'),
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

    it('should return mapped entity edge when found', async () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
      });
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: edge.uuid,
          name: edge.name,
          group_id: edge.groupId,
          created_at: edge.createdAt,
          fact: '',
          fact_embedding: null,
          episodes: [],
          expired_at: null,
          valid_at: null,
          invalid_at: null,
          attributes: JSON.stringify({}),
          source_node_uuid: sourceNodeUuid,
          target_node_uuid: targetNodeUuid,
        },
      ]);
      const result = await repo.getByUuid(edge.uuid);
      expect(result?.name).toBe('KNOWS');
      expect(result?.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(result?.targetNodeUuid).toBe(targetNodeUuid);
      expect(result?.factEmbedding).toBeNull();
    });
  });

  describe('getBetweenNodes', () => {
    it('should query between source and target', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getBetweenNodes(sourceNodeUuid, targetNodeUuid);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('RELATES_TO'),
        expect.objectContaining({
          sourceUuid: sourceNodeUuid,
          targetUuid: targetNodeUuid,
        }),
      );
    });
  });

  describe('getByNodeUuid', () => {
    it('should query edges where node is source or target', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByNodeUuid(sourceNodeUuid);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining(
          'source.uuid = $nodeUuid OR target.uuid = $nodeUuid',
        ),
        expect.objectContaining({ nodeUuid: sourceNodeUuid }),
      );
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
  });

  describe('onModuleInit', () => {
    it('should create the edge_facts fulltext index', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.onModuleInit();
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('edge_facts'),
        {},
      );
    });
  });

  describe('searchByFact', () => {
    it('should use fulltext queryRelationships procedure', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.searchByFact('Alice works', ['group-1'], 10);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('db.index.fulltext.queryRelationships'),
        expect.objectContaining({
          query: 'Alice works',
          groupIds: ['group-1'],
        }),
      );
    });

    it('should return mapped entity edges', async () => {
      const edge = createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeUuid,
        targetNodeUuid,
      });
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: edge.uuid,
          name: edge.name,
          group_id: edge.groupId,
          created_at: edge.createdAt,
          fact: 'Alice works at Acme',
          fact_embedding: null,
          episodes: [],
          expired_at: null,
          valid_at: null,
          invalid_at: null,
          attributes: JSON.stringify({}),
          source_node_uuid: sourceNodeUuid,
          target_node_uuid: targetNodeUuid,
        },
      ]);
      const results = await repo.searchByFact('Alice works', ['group-1'], 10);
      expect(results).toHaveLength(1);
      expect(results[0].fact).toBe('Alice works at Acme');
    });

    it('should return empty array when no results', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      const results = await repo.searchByFact('nonexistent', ['group-1'], 10);
      expect(results).toEqual([]);
    });
  });
});
