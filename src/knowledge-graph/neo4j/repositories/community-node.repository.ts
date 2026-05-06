import { Injectable, OnModuleInit } from '@nestjs/common';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { CommunityNode } from '@/knowledge-graph/models/nodes/community-node';
import {
  toNeo4jDateTime,
  toNeo4jInt,
} from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import {
  buildLabelString,
  groupNodesByLabel,
} from '@/knowledge-graph/neo4j/node-label.utils';
import { buildFulltextQuery } from '@/knowledge-graph/search/search-filters';

@Injectable()
export class CommunityNodeRepository implements OnModuleInit {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE FULLTEXT INDEX community_names IF NOT EXISTS
       FOR (n:Community) ON EACH [n.name, n.summary, n.group_id]`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE VECTOR INDEX community_names_embedding IF NOT EXISTS
       FOR (n:Community) ON n.name_embedding
       WITH [n.group_id]
       OPTIONS {indexConfig: {\`vector.dimensions\`: $dims, \`vector.similarity_function\`: 'cosine'}}`,
      { dims: toNeo4jInt(this.embeddingService.dimensions) },
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX community_group_id IF NOT EXISTS FOR (n:Community) ON (n.group_id)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX community_uuid IF NOT EXISTS FOR (n:Community) ON (n.uuid)`,
      {},
    );
  }

  async save(node: CommunityNode): Promise<string> {
    const labelStr = buildLabelString(node.labels);
    const props: Record<string, unknown> = {
      name: node.name,
      group_id: node.groupId,
      created_at: toNeo4jDateTime(node.createdAt),
      summary: node.summary,
    };

    if (node.nameEmbedding) {
      const results = await this.neo4j.executeWrite<{ uuid: string }>(
        /* cypher */ `MERGE (n:${labelStr} {uuid: $uuid})
         SET n += $props
         WITH n CALL db.create.setNodeVectorProperty(n, 'name_embedding', $nameEmbedding)
         RETURN n.uuid AS uuid`,
        { uuid: node.uuid, props, nameEmbedding: node.nameEmbedding },
      );
      return results[0].uuid;
    } else {
      const results = await this.neo4j.executeWrite<{ uuid: string }>(
        /* cypher */ `MERGE (n:${labelStr} {uuid: $uuid})
         SET n += $props
         RETURN n.uuid AS uuid`,
        { uuid: node.uuid, props },
      );
      return results[0].uuid;
    }
  }

  async saveBulk(nodes: CommunityNode[]): Promise<void> {
    if (nodes.length === 0) return;

    for (const [labelStr, group] of groupNodesByLabel(nodes)) {
      const withEmbedding = group.filter((n) => n.nameEmbedding);
      const withoutEmbedding = group.filter((n) => !n.nameEmbedding);

      if (withoutEmbedding.length > 0) {
        await this.neo4j.executeWrite(
          /* cypher */ `UNWIND $nodes AS node
           MERGE (n:${labelStr} {uuid: node.uuid})
           SET n += node.props`,
          {
            nodes: withoutEmbedding.map((n) => ({
              uuid: n.uuid,
              props: {
                name: n.name,
                group_id: n.groupId,
                created_at: toNeo4jDateTime(n.createdAt),
                summary: n.summary,
              },
            })),
          },
        );
      }

      if (withEmbedding.length > 0) {
        await this.neo4j.executeWrite(
          /* cypher */ `UNWIND $nodes AS node
           MERGE (n:${labelStr} {uuid: node.uuid})
           SET n += node.props
           WITH n, node
           CALL db.create.setNodeVectorProperty(n, 'name_embedding', node.nameEmbedding)`,
          {
            nodes: withEmbedding.map((n) => ({
              uuid: n.uuid,
              props: {
                name: n.name,
                group_id: n.groupId,
                created_at: toNeo4jDateTime(n.createdAt),
                summary: n.summary,
              },
              nameEmbedding: n.nameEmbedding,
            })),
          },
        );
      }
    }
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Community {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Community) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Community {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: string): Promise<CommunityNode | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Community {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.name_embedding AS name_embedding, labels(n) AS labels`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<CommunityNode[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Community) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.name_embedding AS name_embedding, labels(n) AS labels`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
  ): Promise<CommunityNode[]> {
    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const params: Record<string, unknown> = { groupIds };
    if (limit !== undefined) params['limit'] = limit;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Community) WHERE n.group_id IN $groupIds
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.name_embedding AS name_embedding, labels(n) AS labels
       ${limitClause}`,
      params,
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchByName(
    query: string,
    groupIds: string[],
    limit: number,
  ): Promise<CommunityNode[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `CALL db.index.fulltext.queryNodes('community_names', $luceneQuery)
       YIELD node AS n, score
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.name_embedding AS name_embedding, labels(n) AS labels
       ORDER BY score DESC
       LIMIT $limit`,
      { luceneQuery: buildFulltextQuery(query, groupIds), limit },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchBySimilarity(
    embedding: number[],
    groupIds: string[],
    limit: number,
    minScore = 0,
  ): Promise<CommunityNode[]> {
    if (groupIds.length === 0) return [];

    const perGroup = await Promise.all(
      groupIds.map((groupId) =>
        this.neo4j.executeRead<Record<string, unknown>>(
          /* cypher */ `MATCH (n:Community)
           SEARCH n IN (
             VECTOR INDEX community_names_embedding
             FOR $embedding
             WHERE n.group_id = $groupId
             LIMIT $limit
           ) SCORE AS score
           WHERE score >= $minScore
           RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
                  n.created_at AS created_at, n.summary AS summary,
                  n.name_embedding AS name_embedding, labels(n) AS labels, score`,
          { embedding, groupId, limit, minScore },
        ),
      ),
    );

    return perGroup
      .flat()
      .sort((a, b) => (b['score'] as number) - (a['score'] as number))
      .slice(0, limit)
      .map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): CommunityNode {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      labels: row['labels'] as string[],
      createdAt: row['created_at'] as Date,
      summary: (row['summary'] as string) ?? '',
      nameEmbedding: (row['name_embedding'] as number[] | null) ?? null,
    };
  }
}
