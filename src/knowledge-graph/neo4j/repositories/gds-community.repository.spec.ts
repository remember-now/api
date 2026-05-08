import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import {
  GraphNameSchema,
  GroupIdSchema,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

import { GdsCommunityRepository } from './gds-community.repository';

const myGraph = GraphNameSchema.parse('my-graph');
const group1 = GroupIdSchema.parse('group-1');

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
      await repo.projectGraph(myGraph, group1);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('gds.graph.project'),
        { graphName: myGraph, groupId: group1 },
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
      const result = await repo.runLeiden(myGraph);
      expect(neo4j.executeRead).toHaveBeenCalledWith(
        expect.stringContaining('gds.leiden.stream'),
        { graphName: myGraph },
      );
      expect(result).toEqual(rows);
    });
  });

  describe('dropGraph', () => {
    it('should call executeWrite with gds.graph.drop and correct params', async () => {
      neo4j.executeWrite.mockResolvedValue([]);
      await repo.dropGraph(myGraph);
      expect(neo4j.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('gds.graph.drop'),
        { graphName: myGraph },
      );
    });
  });
});
