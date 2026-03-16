import { Injectable } from '@nestjs/common';

import { SagaNode } from '@/knowledge-graph/models/nodes/saga-node';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class SagaNodeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async save(node: SagaNode): Promise<string> {
    const results = await this.neo4j.runQuery<{ uuid: string }>(
      /* cypher */ `MERGE (n:Saga {uuid: $uuid})
       SET n += $props
       RETURN n.uuid AS uuid`,
      {
        uuid: node.uuid,
        props: {
          name: node.name,
          group_id: node.groupId,
          created_at: toNeo4jDateTime(node.createdAt),
        },
      },
    );
    return results[0].uuid;
  }

  async saveBulk(nodes: SagaNode[]): Promise<void> {
    await Promise.all(nodes.map((n) => this.save(n)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.runQuery(
      '/*cypher*/ MATCH (n:Saga {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.runQuery(
      '/*cypher*/ MATCH (n:Saga) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.neo4j.runQuery(
      '/*cypher*/ MATCH (n:Saga {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: string): Promise<SagaNode | null> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Saga {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<SagaNode[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Saga) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
    uuidCursor?: string,
  ): Promise<SagaNode[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const cursorClause = uuidCursor ? 'AND n.uuid < $uuidCursor' : '';
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Saga) WHERE n.group_id IN $groupIds ${cursorClause}
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at
       ORDER BY n.uuid DESC ${limitClause}`,
      { groupIds, uuidCursor: uuidCursor ?? null },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): SagaNode {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      createdAt: row['created_at'] as Date,
    };
  }
}
