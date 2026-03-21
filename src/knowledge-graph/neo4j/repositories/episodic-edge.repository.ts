import { Injectable } from '@nestjs/common';

import { EpisodicEdge } from '@/knowledge-graph/models/edges/episodic-edge';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class EpisodicEdgeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async save(edge: EpisodicEdge): Promise<string> {
    const results = await this.neo4j.executeWrite<{ uuid: string }>(
      /* cypher */ `MATCH (episode:Episodic {uuid: $sourceNodeUuid})
       MATCH (node:Entity {uuid: $targetNodeUuid})
       MERGE (episode)-[e:MENTIONS {uuid: $uuid}]->(node)
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

  async saveBulk(edges: EpisodicEdge[]): Promise<void> {
    await Promise.all(edges.map((e) => this.save(e)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:MENTIONS {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:MENTIONS]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: string): Promise<EpisodicEdge | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (episode:Episodic)-[e:MENTIONS {uuid: $uuid}]->(node:Entity)
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              episode.uuid AS source_node_uuid, node.uuid AS target_node_uuid`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<EpisodicEdge[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (episode:Episodic)-[e:MENTIONS]->(node:Entity)
       WHERE e.uuid IN $uuids
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              episode.uuid AS source_node_uuid, node.uuid AS target_node_uuid`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
    uuidCursor?: string,
  ): Promise<EpisodicEdge[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const cursorClause = uuidCursor ? 'AND e.uuid < $uuidCursor' : '';
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (episode:Episodic)-[e:MENTIONS]->(node:Entity)
       WHERE e.group_id IN $groupIds ${cursorClause}
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              episode.uuid AS source_node_uuid, node.uuid AS target_node_uuid
       ORDER BY e.uuid DESC ${limitClause}`,
      { groupIds, uuidCursor: uuidCursor ?? null },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): EpisodicEdge {
    return {
      uuid: row['uuid'] as string,
      groupId: row['group_id'] as string,
      createdAt: row['created_at'] as Date,
      sourceNodeUuid: row['source_node_uuid'] as string,
      targetNodeUuid: row['target_node_uuid'] as string,
    };
  }
}
