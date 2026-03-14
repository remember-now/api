import { Injectable } from '@nestjs/common';

import { EpisodicNode } from '@/knowledge-graph/models/nodes/episodic-node';
import { EpisodeType } from '@/knowledge-graph/models/nodes/node.types';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class EpisodicNodeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async save(node: EpisodicNode): Promise<string> {
    const results = await this.neo4j.runQuery<{ uuid: string }>(
      `MERGE (n:Episodic {uuid: $uuid})
       SET n += $props
       RETURN n.uuid AS uuid`,
      {
        uuid: node.uuid,
        props: {
          name: node.name,
          group_id: node.groupId,
          created_at: toNeo4jDateTime(node.createdAt),
          source: node.source,
          source_description: node.sourceDescription,
          content: node.content,
          valid_at: toNeo4jDateTime(node.validAt),
          entity_edges: node.entityEdges,
        },
      },
    );
    return results[0].uuid;
  }

  async saveBulk(nodes: EpisodicNode[]): Promise<void> {
    await Promise.all(nodes.map((n) => this.save(n)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Episodic {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Episodic) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Episodic {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: string): Promise<EpisodicNode | null> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Episodic {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.source AS source,
              n.source_description AS source_description, n.content AS content,
              n.valid_at AS valid_at, n.entity_edges AS entity_edges`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<EpisodicNode[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Episodic) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.source AS source,
              n.source_description AS source_description, n.content AS content,
              n.valid_at AS valid_at, n.entity_edges AS entity_edges`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
    uuidCursor?: string,
  ): Promise<EpisodicNode[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const cursorClause = uuidCursor ? 'AND n.uuid > $uuidCursor' : '';
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Episodic) WHERE n.group_id IN $groupIds ${cursorClause}
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.source AS source,
              n.source_description AS source_description, n.content AS content,
              n.valid_at AS valid_at, n.entity_edges AS entity_edges
       ${limitClause}`,
      { groupIds, uuidCursor: uuidCursor ?? null },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByEntityNodeUuid(entityNodeUuid: string): Promise<EpisodicNode[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (e:Episodic)-[:MENTIONS]->(:Entity {uuid: $entityNodeUuid})
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.source AS source,
              e.source_description AS source_description, e.content AS content,
              e.valid_at AS valid_at, e.entity_edges AS entity_edges`,
      { entityNodeUuid },
    );
    return results.map((r) => this.mapRow(r));
  }

  async retrieveEpisodes(
    referenceTime: Date,
    lastN: number,
    groupIds?: string[],
    source?: EpisodeType,
    sagaUuid?: string,
  ): Promise<EpisodicNode[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (e:Episodic)
       WHERE e.valid_at <= $referenceTime
       AND ($groupIds IS NULL OR e.group_id IN $groupIds)
       AND ($source IS NULL OR e.source = $source)
       AND ($sagaUuid IS NULL OR EXISTS { (:Saga {uuid: $sagaUuid})-[:HAS_EPISODE]->(e) })
       ORDER BY e.valid_at DESC
       LIMIT $lastN
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.source AS source,
              e.source_description AS source_description, e.content AS content,
              e.valid_at AS valid_at, e.entity_edges AS entity_edges`,
      {
        referenceTime: toNeo4jDateTime(referenceTime),
        groupIds: groupIds ?? null,
        source: source ?? null,
        sagaUuid: sagaUuid ?? null,
        lastN,
      },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): EpisodicNode {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      createdAt:
        row['created_at'] instanceof Date
          ? row['created_at']
          : new Date(row['created_at'] as string),
      source: (row['source'] as EpisodeType) ?? EpisodeType.text,
      sourceDescription: (row['source_description'] as string) ?? '',
      content: (row['content'] as string) ?? '',
      validAt:
        row['valid_at'] instanceof Date
          ? row['valid_at']
          : new Date(row['valid_at'] as string),
      entityEdges: (row['entity_edges'] as string[]) ?? [],
    };
  }
}
