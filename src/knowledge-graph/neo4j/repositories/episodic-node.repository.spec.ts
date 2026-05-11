import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import neoDriver from 'neo4j-driver';

import { EpisodeType } from '@/knowledge-graph/models';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { RetrieveEpisodesParamsSchema } from '@/knowledge-graph/neo4j/types';
import { KG_REFERENCE_TIME, KgNodeFactory, kgUuid } from '@/test/factories';

import { EpisodicNodeRepository } from './episodic-node.repository';

describe('EpisodicNodeRepository', () => {
  let repo: EpisodicNodeRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new EpisodicNodeRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should call MERGE on Episodic and return uuid', async () => {
      const node = KgNodeFactory.createEpisodicNode({
        name: 'Episode 1',
        content: 'content',
      });
      neo4j.executeWrite.mockResolvedValue([{ uuid: node.uuid }]);
      const result = await repo.save(node);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Episodic'),
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

    it('should return mapped episodic node when found', async () => {
      const node = KgNodeFactory.createEpisodicNode({
        name: 'Episode 1',
        content: 'content',
      });
      neo4j.executeRead.mockResolvedValue([
        {
          uuid: node.uuid,
          name: node.name,
          group_id: node.groupId,
          created_at: node.createdAt,
          source: EpisodeType.text,
          source_description: '',
          content: 'content',
          valid_at: KG_REFERENCE_TIME,
          labels: ['Episodic'],
        },
      ]);
      const result = await repo.getByUuid(node.uuid);
      expect(result?.name).toBe('Episode 1');
      expect(result?.content).toBe('content');
      expect(result?.source).toBe(EpisodeType.text);
      expect(result?.labels).toEqual(['Episodic']);
    });
  });

  describe('getByEntityNodeUuid', () => {
    it('should query with MENTIONS relationship', async () => {
      const entityNodeUuid = kgUuid();
      neo4j.executeRead.mockResolvedValue([]);
      await repo.getByEntityNodeUuid(entityNodeUuid);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('MENTIONS'),
        expect.objectContaining({ entityNodeUuid }),
      );
    });
  });

  describe('retrieveEpisodes', () => {
    it('should query with referenceTime and lastN', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.retrieveEpisodes(
        RetrieveEpisodesParamsSchema.parse({
          referenceTime: new Date(),
          lastN: 10,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY e.valid_at DESC'),
        expect.objectContaining({ lastN: neoDriver.int(10) }),
      );
    });

    it('should pass groupIds when provided', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.retrieveEpisodes(
        RetrieveEpisodesParamsSchema.parse({
          referenceTime: new Date(),
          lastN: 5,
          groupIds: ['group-1'],
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ groupIds: ['group-1'] }),
      );
    });

    it('should pass null groupIds when not provided', async () => {
      neo4j.executeRead.mockResolvedValue([]);
      await repo.retrieveEpisodes(
        RetrieveEpisodesParamsSchema.parse({
          referenceTime: new Date(),
          lastN: 5,
        }),
      );
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ groupIds: null }),
      );
    });
  });
});
