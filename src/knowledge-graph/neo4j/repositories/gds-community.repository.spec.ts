import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { GdsCommunityRepository } from './gds-community.repository';

describe('GdsCommunityRepository', () => {
  let repo: GdsCommunityRepository;
  let neo4j: DeepMockProxy<Neo4jService>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
    repo = new GdsCommunityRepository(neo4j);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('projectGraph', () => {
    it('should call executeWrite with gds.graph.project and correct params', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.projectGraph('my-graph', 'group-1');
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('gds.graph.project'),
        { graphName: 'my-graph', groupId: 'group-1' },
      );
    });
  });

  describe('runLeiden', () => {
    it('should call executeRead with gds.leiden.stream and return rows', async () => {
      const rows = [
        { uuid: 'uuid-a', communityId: 0 },
        { uuid: 'uuid-b', communityId: 1 },
      ];
      neo4j.executeRead.mockResolvedValue(rows);
      const result = await repo.runLeiden('my-graph');
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('gds.leiden.stream'),
        { graphName: 'my-graph' },
      );
      expect(result).toEqual(rows);
    });
  });

  describe('dropGraph', () => {
    it('should call executeWrite with gds.graph.drop and correct params', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.dropGraph('my-graph');
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('gds.graph.drop'),
        { graphName: 'my-graph' },
      );
    });
  });
});
