import { Injectable, OnModuleInit } from '@nestjs/common';

import { CommunityEdge } from '@/knowledge-graph/models';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import {
  GetByGroupIdsParams,
  Uuid,
  UuidArray,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class CommunityEdgeRepository implements OnModuleInit {
  constructor(private readonly neo4j: Neo4jService) {}

  async onModuleInit(): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX community_edge_group_id IF NOT EXISTS FOR ()-[r:HAS_MEMBER]-() ON (r.group_id)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX has_member_uuid IF NOT EXISTS FOR ()-[e:HAS_MEMBER]-() ON (e.uuid)`,
      {},
    );
  }

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
    if (edges.length === 0) return;

    await this.neo4j.executeWrite(
      /* cypher */ `UNWIND $edges AS edge
       MATCH (community:Community {uuid: edge.sourceNodeUuid})
       MATCH (entity:Entity {uuid: edge.targetNodeUuid})
       MERGE (community)-[e:HAS_MEMBER {uuid: edge.uuid}]->(entity)
       SET e.group_id = edge.groupId, e.created_at = edge.createdAt`,
      {
        edges: edges.map((e) => ({
          uuid: e.uuid,
          sourceNodeUuid: e.sourceNodeUuid,
          targetNodeUuid: e.targetNodeUuid,
          groupId: e.groupId,
          createdAt: toNeo4jDateTime(e.createdAt),
        })),
      },
    );
  }

  async delete(uuid: Uuid): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:HAS_MEMBER {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: UuidArray): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:HAS_MEMBER]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: Uuid): Promise<CommunityEdge | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (community:Community)-[e:HAS_MEMBER {uuid: $uuid}]->(entity:Entity)
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              community.uuid AS source_node_uuid, entity.uuid AS target_node_uuid`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: UuidArray): Promise<CommunityEdge[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (community:Community)-[e:HAS_MEMBER]->(entity:Entity)
       WHERE e.uuid IN $uuids
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              community.uuid AS source_node_uuid, entity.uuid AS target_node_uuid`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(params: GetByGroupIdsParams): Promise<CommunityEdge[]> {
    const { groupIds, limit } = params;

    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const queryParams: Record<string, unknown> = { groupIds };
    if (limit !== undefined) queryParams['limit'] = limit;

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (community:Community)-[e:HAS_MEMBER]->(entity:Entity)
       WHERE e.group_id IN $groupIds
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              community.uuid AS source_node_uuid, entity.uuid AS target_node_uuid
       ${limitClause}`,
      queryParams,
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
