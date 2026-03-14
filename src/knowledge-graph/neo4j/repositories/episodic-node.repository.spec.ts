import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { createEpisodicNode } from '@/knowledge-graph/models/nodes/episodic-node';
import { EpisodeType } from '@/knowledge-graph/models/nodes/node.types';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { EpisodicNodeRepository } from './episodic-node.repository';

describe('EpisodicNodeRepository', () => {
  let repo: EpisodicNodeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  const validAt = new Date('2024-01-01T00:00:00Z');

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new EpisodicNodeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on Episodic and return uuid', async () => {
      const node = createEpisodicNode({
        name: 'Episode 1',
        content: 'content',
        validAt,
      });
      neo4j.runQuery.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Episodic'),
        expect.objectContaining({ uuid: node.uuid }),
      );
      expect(result).toBe(node.uuid);
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

    it('should return mapped episodic node when found', async () => {
      const node = createEpisodicNode({
        name: 'Episode 1',
        content: 'content',
        validAt,
      });
      neo4j.runQuery.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
          source: EpisodeType.text,
          source_description: '',
          content: 'content',
          valid_at: validAt,
          entity_edges: [],
        },
      ]);
      const result = await repo.getByUuid(node.uuid);
      expect(result?.name).toBe('Episode 1');
      expect(result?.content).toBe('content');
      expect(result?.source).toBe(EpisodeType.text);
    });
  });

  describe('getByEntityNodeUuid', () => {
    it('should query with MENTIONS relationship', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.getByEntityNodeUuid('entity-uuid');
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MENTIONS'),
        expect.objectContaining({ entityNodeUuid: 'entity-uuid' }),
      );
    });
  });

  describe('retrieveEpisodes', () => {
    it('should query with referenceTime and lastN', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.retrieveEpisodes(new Date(), 10);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY e.valid_at DESC'),
        expect.objectContaining({ lastN: 10 }),
      );
    });

    it('should pass groupIds when provided', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.retrieveEpisodes(new Date(), 5, ['group-1']);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ groupIds: ['group-1'] }),
      );
    });

    it('should pass null groupIds when not provided', async () => {
      neo4j.runQuery.mockResolvedValue([]);
      await repo.retrieveEpisodes(new Date(), 5);
      expect(neo4j.runQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ groupIds: null }),
      );
    });
  });
});
