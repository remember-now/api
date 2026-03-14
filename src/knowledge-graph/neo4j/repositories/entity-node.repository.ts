import { Injectable } from '@nestjs/common';

import { EntityNode } from '@/knowledge-graph/models/nodes/entity-node';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class EntityNodeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async save(node: EntityNode): Promise<string> {
    const props: Record<string, unknown> = {
      name: node.name,
      group_id: node.groupId,
      created_at: toNeo4jDateTime(node.createdAt),
      summary: node.summary,
      attributes: JSON.stringify(node.attributes),
    };

    if (node.nameEmbedding) {
      const results = await this.neo4j.runQuery<{ uuid: string }>(
        `MERGE (n:Entity {uuid: $uuid})
         SET n += $props
         WITH n CALL db.create.setNodeVectorProperty(n, 'name_embedding', $nameEmbedding)
         RETURN n.uuid AS uuid`,
        { uuid: node.uuid, props, nameEmbedding: node.nameEmbedding },
      );
      return results[0].uuid;
    } else {
      const results = await this.neo4j.runQuery<{ uuid: string }>(
        `MERGE (n:Entity {uuid: $uuid})
         SET n += $props
         RETURN n.uuid AS uuid`,
        { uuid: node.uuid, props },
      );
      return results[0].uuid;
    }
  }

  async saveBulk(nodes: EntityNode[]): Promise<void> {
    await Promise.all(nodes.map((n) => this.save(n)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Entity {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Entity) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Entity {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: string): Promise<EntityNode | null> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Entity {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<EntityNode[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Entity) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
    uuidCursor?: string,
  ): Promise<EntityNode[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const cursorClause = uuidCursor ? 'AND n.uuid > $uuidCursor' : '';
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Entity) WHERE n.group_id IN $groupIds ${cursorClause}
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels
       ${limitClause}`,
      { groupIds, uuidCursor: uuidCursor ?? null },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): EntityNode {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      createdAt:
        row['created_at'] instanceof Date
          ? row['created_at']
          : new Date(row['created_at'] as string),
      summary: (row['summary'] as string) ?? '',
      attributes: row['attributes']
        ? (JSON.parse(row['attributes'] as string) as Record<string, unknown>)
        : {},
      nameEmbedding: (row['name_embedding'] as number[] | null) ?? null,
      labels: (row['labels'] as string[]) ?? ['Entity'],
    };
  }
}
