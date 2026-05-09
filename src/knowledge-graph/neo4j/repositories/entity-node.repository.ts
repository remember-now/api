import { Injectable, OnModuleInit } from '@nestjs/common';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { EntityNode } from '@/knowledge-graph/models';
import { buildNodeFilterClause } from '@/knowledge-graph/neo4j/cypher-filter-builders';
import {
  fromNeo4jInt,
  toNeo4jDateTime,
  toNeo4jInt,
} from '@/knowledge-graph/neo4j/neo4j-utils';
import { buildFulltextQuery } from '@/knowledge-graph/neo4j/neo4j-utils';
import {
  GetByGroupIdsParams,
  GroupId,
  NodeLabels,
  NodeName,
  SearchByBfsParams,
  SearchBySimilarityParams,
  SearchByTextParams,
  Uuid,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import {
  buildLabelString,
  groupNodesByLabel,
} from '@/knowledge-graph/neo4j/node-label.utils';
import { MAX_SEARCH_DEPTH } from '@/knowledge-graph/search/search-config.types';
import { SearchFilters } from '@/knowledge-graph/search/search-filters.types';

@Injectable()
export class EntityNodeRepository implements OnModuleInit {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE FULLTEXT INDEX entity_names IF NOT EXISTS
       FOR (n:Entity) ON EACH [n.name, n.summary, n.group_id]`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE VECTOR INDEX entity_names_embedding IF NOT EXISTS
       FOR (n:Entity) ON n.name_embedding
       WITH [n.group_id]
       OPTIONS {indexConfig: {\`vector.dimensions\`: $dims, \`vector.similarity_function\`: 'cosine'}}`,
      { dims: toNeo4jInt(this.embeddingService.dimensions) },
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX entity_group_id IF NOT EXISTS FOR (n:Entity) ON (n.group_id)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX entity_uuid IF NOT EXISTS FOR (n:Entity) ON (n.uuid)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX name_entity_index IF NOT EXISTS FOR (n:Entity) ON (n.name)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX created_at_entity_index IF NOT EXISTS FOR (n:Entity) ON (n.created_at)`,
      {},
    );
  }

  async save(node: EntityNode): Promise<string> {
    const labelStr = buildLabelString(node.labels);

    const props: Record<string, unknown> = {
      name: node.name,
      group_id: node.groupId,
      created_at: toNeo4jDateTime(node.createdAt),
      summary: node.summary,
      attributes: JSON.stringify(node.attributes),
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

  async saveBulk(nodes: EntityNode[]): Promise<void> {
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
                attributes: JSON.stringify(n.attributes),
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
                attributes: JSON.stringify(n.attributes),
              },
              nameEmbedding: n.nameEmbedding,
            })),
          },
        );
      }
    }
  }

  async delete(uuid: Uuid): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Entity {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Entity) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteIfSoleMentioned(nodeUuid: Uuid): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `MATCH (ep:Episodic)-[:MENTIONS]->(n:Entity {uuid: $nodeUuid})
       WITH n, count(ep) AS cnt
       WHERE cnt = 1
       DETACH DELETE n`,
      { nodeUuid },
    );
  }

  async deleteByGroupId(groupId: GroupId): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Entity {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: Uuid): Promise<EntityNode | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Entity {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: Uuid[]): Promise<EntityNode[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Entity) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(params: GetByGroupIdsParams): Promise<EntityNode[]> {
    const { groupIds, limit } = params;

    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const queryParams: Record<string, unknown> = { groupIds };
    if (limit !== undefined) queryParams['limit'] = limit;

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Entity) WHERE n.group_id IN $groupIds
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels
       ${limitClause}`,
      queryParams,
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchByName(
    params: SearchByTextParams,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { query, groupIds, limit } = params;
    const { clause, params: filterParams } = filters
      ? buildNodeFilterClause(filters, 'n')
      : { clause: '', params: {} };
    const whereClause = clause ? `WHERE ${clause}` : '';

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `CALL db.index.fulltext.queryNodes('entity_names', $luceneQuery)
       YIELD node AS n, score
       ${whereClause}
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels
       ORDER BY score DESC
       LIMIT $limit`,
      {
        luceneQuery: buildFulltextQuery(query, groupIds),
        limit,
        ...filterParams,
      },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchBySimilarity(
    params: SearchBySimilarityParams,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { embedding, groupIds, limit, minScore } = params;
    if (groupIds.length === 0) return [];

    const { clause, params: filterParams } = filters
      ? buildNodeFilterClause(filters, 'n')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    const perGroup = await Promise.all(
      groupIds.map((groupId) =>
        this.neo4j.executeRead<Record<string, unknown>>(
          /* cypher */ `MATCH (n:Entity)
           SEARCH n IN (
             VECTOR INDEX entity_names_embedding
             FOR $embedding
             WHERE n.group_id = $groupId
             LIMIT $limit
           ) SCORE AS score
           WHERE score >= $minScore${whereExtra}
           RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
                  n.created_at AS created_at, n.summary AS summary,
                  n.attributes AS attributes, n.name_embedding AS name_embedding,
                  labels(n) AS labels, score`,
          {
            embedding,
            groupId,
            limit,
            minScore,
            ...filterParams,
          },
        ),
      ),
    );

    return perGroup
      .flat()
      .sort((a, b) => (b['score'] as number) - (a['score'] as number))
      .slice(0, fromNeo4jInt(limit))
      .map((r) => this.mapRow(r));
  }

  async searchByBfs(
    params: SearchByBfsParams,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { originNodeUuids, groupIds, limit, maxDepth } = params;
    if (originNodeUuids.length === 0) return [];

    const depth =
      maxDepth !== undefined ? fromNeo4jInt(maxDepth) : MAX_SEARCH_DEPTH;

    const { clause, params: filterParams } = filters
      ? buildNodeFilterClause(filters, 'reachable')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (origin:Entity|Episodic)
       WHERE origin.uuid IN $originNodeUuids AND origin.group_id IN $groupIds
       MATCH (origin)-[:RELATES_TO|MENTIONS*1..${depth}]-(reachable:Entity)
       WHERE reachable.group_id IN $groupIds${whereExtra}
       RETURN DISTINCT reachable.uuid AS uuid, reachable.name AS name,
              reachable.group_id AS group_id, reachable.created_at AS created_at,
              reachable.summary AS summary, reachable.attributes AS attributes,
              reachable.name_embedding AS name_embedding, labels(reachable) AS labels
       LIMIT $limit`,
      {
        originNodeUuids,
        groupIds,
        limit,
        ...filterParams,
      },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getNodeDistanceScores(
    nodeUuids: Uuid[],
    centerNodeUuid: Uuid,
  ): Promise<{ uuid: Uuid; score: number }[]> {
    return this.neo4j.executeRead<{ uuid: Uuid; score: number }>(
      /* cypher */ `UNWIND $nodeUuids AS nodeUuid
       MATCH (center:Entity {uuid: $centerUuid})-[:RELATES_TO]-(n:Entity {uuid: nodeUuid})
       RETURN 1 AS score, nodeUuid AS uuid`,
      { nodeUuids, centerUuid: centerNodeUuid },
    );
  }

  async getEpisodeMentionCounts(
    nodeUuids: Uuid[],
  ): Promise<{ uuid: Uuid; score: number }[]> {
    return this.neo4j.executeRead<{ uuid: Uuid; score: number }>(
      /* cypher */ `UNWIND $nodeUuids AS nodeUuid
       MATCH (ep:Episodic)-[:MENTIONS]->(n:Entity {uuid: nodeUuid})
       RETURN count(*) AS score, n.uuid AS uuid`,
      { nodeUuids },
    );
  }

  private mapRow(row: Record<string, unknown>): EntityNode {
    return {
      uuid: row['uuid'] as Uuid,
      name: row['name'] as NodeName,
      groupId: row['group_id'] as GroupId,
      createdAt: row['created_at'] as Date,
      summary: (row['summary'] as string) ?? '',
      attributes: row['attributes']
        ? (JSON.parse(row['attributes'] as string) as Record<string, unknown>)
        : {},
      nameEmbedding: (row['name_embedding'] as number[] | null) ?? null,
      labels: row['labels'] as NodeLabels,
    };
  }
}
