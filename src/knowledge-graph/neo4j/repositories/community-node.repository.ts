import { Injectable } from '@nestjs/common';

import { CommunityNode } from '@/knowledge-graph/models/nodes/community-node';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class CommunityNodeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

  async save(node: CommunityNode): Promise<string> {
    const props: Record<string, unknown> = {
      name: node.name,
      group_id: node.groupId,
      created_at: toNeo4jDateTime(node.createdAt),
      summary: node.summary,
    };

    if (node.nameEmbedding) {
      const results = await this.neo4j.runQuery<{ uuid: string }>(
        `MERGE (n:Community {uuid: $uuid})
         SET n += $props
         WITH n CALL db.create.setNodeVectorProperty(n, 'name_embedding', $nameEmbedding)
         RETURN n.uuid AS uuid`,
        { uuid: node.uuid, props, nameEmbedding: node.nameEmbedding },
      );
      return results[0].uuid;
    } else {
      const results = await this.neo4j.runQuery<{ uuid: string }>(
        `MERGE (n:Community {uuid: $uuid})
         SET n += $props
         RETURN n.uuid AS uuid`,
        { uuid: node.uuid, props },
      );
      return results[0].uuid;
    }
  }

  async saveBulk(nodes: CommunityNode[]): Promise<void> {
    await Promise.all(nodes.map((n) => this.save(n)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Community {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Community) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH (n:Community {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: string): Promise<CommunityNode | null> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Community {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.name_embedding AS name_embedding`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<CommunityNode[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Community) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.name_embedding AS name_embedding`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
  ): Promise<CommunityNode[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (n:Community) WHERE n.group_id IN $groupIds
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.name_embedding AS name_embedding
       ${limitClause}`,
      { groupIds },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): CommunityNode {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      createdAt: row['created_at'] as Date,
      summary: (row['summary'] as string) ?? '',
      nameEmbedding: (row['name_embedding'] as number[] | null) ?? null,
    };
  }
}
