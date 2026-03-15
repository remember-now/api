import { Injectable } from '@nestjs/common';

import { HasEpisodeEdge } from '@/knowledge-graph/models/edges/has-episode-edge';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class HasEpisodeEdgeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async save(edge: HasEpisodeEdge): Promise<string> {
    const results = await this.neo4j.runQuery<{ uuid: string }>(
      `MATCH (saga:Saga {uuid: $sourceNodeUuid})
       MATCH (episode:Episodic {uuid: $targetNodeUuid})
       MERGE (saga)-[e:HAS_EPISODE {uuid: $uuid}]->(episode)
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

  async saveBulk(edges: HasEpisodeEdge[]): Promise<void> {
    await Promise.all(edges.map((e) => this.save(e)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH ()-[e:HAS_EPISODE {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH ()-[e:HAS_EPISODE]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: string): Promise<HasEpisodeEdge | null> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (saga:Saga)-[e:HAS_EPISODE {uuid: $uuid}]->(episode:Episodic)
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              saga.uuid AS source_node_uuid, episode.uuid AS target_node_uuid`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<HasEpisodeEdge[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (saga:Saga)-[e:HAS_EPISODE]->(episode:Episodic)
       WHERE e.uuid IN $uuids
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              saga.uuid AS source_node_uuid, episode.uuid AS target_node_uuid`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
    uuidCursor?: string,
  ): Promise<HasEpisodeEdge[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const cursorClause = uuidCursor ? 'AND e.uuid < $uuidCursor' : '';
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (saga:Saga)-[e:HAS_EPISODE]->(episode:Episodic)
       WHERE e.group_id IN $groupIds ${cursorClause}
       RETURN e.uuid AS uuid, e.group_id AS group_id, e.created_at AS created_at,
              saga.uuid AS source_node_uuid, episode.uuid AS target_node_uuid
       ORDER BY e.uuid DESC ${limitClause}`,
      { groupIds, uuidCursor: uuidCursor ?? null },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): HasEpisodeEdge {
    return {
      uuid: row['uuid'] as string,
      groupId: row['group_id'] as string,
      createdAt: row['created_at'] as Date,
      sourceNodeUuid: row['source_node_uuid'] as string,
      targetNodeUuid: row['target_node_uuid'] as string,
    };
  }
}
