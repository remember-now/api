import { Injectable } from '@nestjs/common';

import { CommunityEdge } from '@/knowledge-graph/models/edges/community-edge';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class CommunityEdgeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async save(edge: CommunityEdge): Promise<string> {
    const results = await this.neo4j.executeWrite<{ uuid: string }>(
      /* cypher */ `MATCH (community:Community {uuid: $sourceNodeUuid})
       MATCH (entity:Entity {uuid: $targetNodeUuid})
       MERGE (community)-[e:HAS_MEMBER {uuid: $uuid}]->(entity)
       SET e.group_id = $groupId, e.created_at = $createdAt
       RETURN e.uuid AS uuid`,
      {
        uuid: edge.uuid,
        sourceNodeUuid: edge.sourceNodeUuid,
        targetNodeUuid: edge.targetNodeUuid,
        groupId: edge.groupId,
        createdAt: toNeo4jDateTime(edge.createdAt),
      },
    );
    return results[0].uuid;
  }

  async saveBulk(edges: CommunityEdge[]): Promise<void> {
    await Promise.all(edges.map((e) => this.save(e)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:HAS_MEMBER {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:HAS_MEMBER]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: string): Promise<CommunityEdge | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (community:Community)-[e:HAS_MEMBER {uuid: $uuid}]->(entity:Entity)
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              community.uuid AS source_node_uuid, entity.uuid AS target_node_uuid`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<CommunityEdge[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (community:Community)-[e:HAS_MEMBER]->(entity:Entity)
       WHERE e.uuid IN $uuids
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              community.uuid AS source_node_uuid, entity.uuid AS target_node_uuid`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
  ): Promise<CommunityEdge[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (community:Community)-[e:HAS_MEMBER]->(entity:Entity)
       WHERE e.group_id IN $groupIds
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              community.uuid AS source_node_uuid, entity.uuid AS target_node_uuid
       ${limitClause}`,
      { groupIds },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): CommunityEdge {
    return {
      uuid: row['uuid'] as string,
      groupId: row['group_id'] as string,
      createdAt: row['created_at'] as Date,
      sourceNodeUuid: row['source_node_uuid'] as string,
      targetNodeUuid: row['target_node_uuid'] as string,
    };
  }
}
