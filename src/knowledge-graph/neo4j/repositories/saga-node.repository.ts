import { Injectable, OnModuleInit } from '@nestjs/common';

import { SagaNode } from '@/knowledge-graph/models/nodes/saga-node';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { NodeLabelsSchema } from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class SagaNodeRepository implements OnModuleInit {
  constructor(private readonly neo4j: Neo4jService) {}

  async onModuleInit(): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX saga_uuid IF NOT EXISTS FOR (n:Saga) ON (n.uuid)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX saga_group_id IF NOT EXISTS FOR (n:Saga) ON (n.group_id)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX saga_name IF NOT EXISTS FOR (n:Saga) ON (n.name)`,
      {},
    );
  }

  async save(node: SagaNode): Promise<string> {
    NodeLabelsSchema.parse(node.labels);
    const labelStr = [...new Set(node.labels)].join(':');
    const results = await this.neo4j.executeWrite<{ uuid: string }>(
      /* cypher */ `MERGE (n:${labelStr} {uuid: $uuid})
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
    if (nodes.length === 0) return;

    const byLabel = new Map<string, SagaNode[]>();
    for (const n of nodes) {
      const key = [...new Set(n.labels)].sort().join(':');
      byLabel.set(key, [...(byLabel.get(key) ?? []), n]);
    }

    for (const [labelStr, group] of byLabel) {
      NodeLabelsSchema.parse(labelStr.split(':'));

      await this.neo4j.executeWrite(
        /* cypher */ `UNWIND $nodes AS node
         MERGE (n:${labelStr} {uuid: node.uuid})
         SET n += node.props`,
        {
          nodes: group.map((n) => ({
            uuid: n.uuid,
            props: {
              name: n.name,
              group_id: n.groupId,
              created_at: toNeo4jDateTime(n.createdAt),
            },
          })),
        },
      );
    }
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Saga {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Saga) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Saga {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: string): Promise<SagaNode | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Saga {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, labels(n) AS labels`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<SagaNode[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Saga) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, labels(n) AS labels`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
    uuidCursor?: string,
  ): Promise<SagaNode[]> {
    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const cursorClause = uuidCursor ? 'AND n.uuid < $uuidCursor' : '';
    const params: Record<string, unknown> = {
      groupIds,
      uuidCursor: uuidCursor ?? null,
    };
    if (limit !== undefined) params['limit'] = limit;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Saga) WHERE n.group_id IN $groupIds ${cursorClause}
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, labels(n) AS labels
       ORDER BY n.uuid DESC ${limitClause}`,
      params,
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): SagaNode {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      labels: row['labels'] as string[],
      createdAt: row['created_at'] as Date,
    };
  }
}
