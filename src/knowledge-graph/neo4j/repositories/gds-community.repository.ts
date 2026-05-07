import { Injectable } from '@nestjs/common';

import { GraphName, GroupId } from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class GdsCommunityRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async projectGraph(graphName: GraphName, groupId: GroupId): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `MATCH (source:Entity {group_id: $groupId})-[r:RELATES_TO]-(target:Entity {group_id: $groupId})
       WITH gds.graph.project($graphName, source, target) AS g
       RETURN g.graphName, g.nodeCount, g.relationshipCount`,
      { groupId, graphName },
    );
  }

  async runLeiden(
    graphName: GraphName,
  ): Promise<{ uuid: string; communityId: number }[]> {
    return this.neo4j.executeRead<{ uuid: string; communityId: number }>(
      /* cypher */ `CALL gds.leiden.stream($graphName, { randomSeed: 42 })
       YIELD nodeId, communityId
       RETURN gds.util.asNode(nodeId).uuid AS uuid, communityId`,
      { graphName },
    );
  }

  async dropGraph(graphName: GraphName): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CALL gds.graph.drop($graphName, false)`,
      { graphName },
    );
  }
}
