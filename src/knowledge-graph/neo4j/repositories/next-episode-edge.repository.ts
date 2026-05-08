import { Injectable, OnModuleInit } from '@nestjs/common';

import { NextEpisodeEdge } from '@/knowledge-graph/models';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import {
  GetByGroupIdsWithCursorParams,
  GroupId,
  Uuid,
  UuidArray,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class NextEpisodeEdgeRepository implements OnModuleInit {
  constructor(private readonly neo4j: Neo4jService) {}

  async onModuleInit(): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX next_episode_uuid IF NOT EXISTS FOR ()-[e:NEXT_EPISODE]-() ON (e.uuid)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX next_episode_group_id IF NOT EXISTS FOR ()-[e:NEXT_EPISODE]-() ON (e.group_id)`,
      {},
    );
  }

  async save(edge: NextEpisodeEdge): Promise<string> {
    const results = await this.neo4j.executeWrite<{ uuid: string }>(
      /* cypher */ `MATCH (source:Episodic {uuid: $sourceNodeUuid})
       MATCH (target:Episodic {uuid: $targetNodeUuid})
       MERGE (source)-[e:NEXT_EPISODE {uuid: $uuid}]->(target)
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

  async saveBulk(edges: NextEpisodeEdge[]): Promise<void> {
    if (edges.length === 0) return;
    await this.neo4j.executeWrite(
      /* cypher */ `UNWIND $edges AS edge
       MATCH (source:Episodic {uuid: edge.sourceNodeUuid})
       MATCH (target:Episodic {uuid: edge.targetNodeUuid})
       MERGE (source)-[e:NEXT_EPISODE {uuid: edge.uuid}]->(target)
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
      '/*cypher*/ MATCH ()-[e:NEXT_EPISODE {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: UuidArray): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:NEXT_EPISODE]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: Uuid): Promise<NextEpisodeEdge | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Episodic)-[e:NEXT_EPISODE {uuid: $uuid}]->(target:Episodic)
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: UuidArray): Promise<NextEpisodeEdge[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Episodic)-[e:NEXT_EPISODE]->(target:Episodic)
       WHERE e.uuid IN $uuids
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    params: GetByGroupIdsWithCursorParams,
  ): Promise<NextEpisodeEdge[]> {
    const { groupIds, limit, uuidCursor } = params;
    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const cursorClause = uuidCursor ? 'AND e.uuid < $uuidCursor' : '';
    const queryParams: Record<string, unknown> = {
      groupIds,
      uuidCursor: uuidCursor ?? null,
    };
    if (limit !== undefined) queryParams['limit'] = limit;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Episodic)-[e:NEXT_EPISODE]->(target:Episodic)
       WHERE e.group_id IN $groupIds ${cursorClause}
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid
       ORDER BY e.uuid DESC ${limitClause}`,
      queryParams,
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): NextEpisodeEdge {
    return {
      uuid: row['uuid'] as Uuid,
      groupId: row['group_id'] as GroupId,
      createdAt: row['created_at'] as Date,
      sourceNodeUuid: row['source_node_uuid'] as Uuid,
      targetNodeUuid: row['target_node_uuid'] as Uuid,
    };
  }
}
