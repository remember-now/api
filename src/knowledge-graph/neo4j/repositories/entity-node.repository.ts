import { Injectable, OnModuleInit } from '@nestjs/common';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { EntityNode } from '@/knowledge-graph/models/nodes/entity-node';
import { validateNodeLabels } from '@/knowledge-graph/neo4j/neo4j-label-validation';
import {
  toNeo4jDateTime,
  toNeo4jInt,
} from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import {
  buildNodeFilterClause,
  luceneSanitize,
} from '@/knowledge-graph/search/search-filters';
import { SearchFilters } from '@/knowledge-graph/search/search-filters.types';

@Injectable()
export class EntityNodeRepository implements OnModuleInit {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.neo4j.executeWrite(
        /* cypher */ `CREATE FULLTEXT INDEX entity_names IF NOT EXISTS
         FOR (n:Entity) ON EACH [n.name, n.summary]`,
        {},
      ),
      this.neo4j.executeWrite(
        /* cypher */ `CREATE VECTOR INDEX entity_names_embedding IF NOT EXISTS
         FOR (n:Entity) ON n.name_embedding
         OPTIONS {indexConfig: {\`vector.dimensions\`: $dims, \`vector.similarity_function\`: 'cosine'}}`,
        { dims: toNeo4jInt(this.embeddingService.dimensions) },
      ),
    ]);
  }

  async save(node: EntityNode): Promise<string> {
    validateNodeLabels(node.labels);
    const labelStr = [...new Set(node.labels)].join(':');

    const props: Record<string, unknown> = {
      name: node.name,
      group_id: node.groupId,
      created_at: toNeo4jDateTime(node.createdAt),
      summary: node.summary,
      attributes: JSON.stringify(node.attributes),
    };

    if (node.nameEmbedding) {
      const results = await this.neo4j.executeWrite<{ uuid: string }>(
        // labelStr is safe to interpolate — validateNodeLabels ensures only [A-Za-z_][A-Za-z0-9_]* chars
        /* cypher */ `MERGE (n:${labelStr} {uuid: $uuid})
         SET n += $props
         WITH n CALL db.create.setNodeVectorProperty(n, 'name_embedding', $nameEmbedding)
         RETURN n.uuid AS uuid`,
        { uuid: node.uuid, props, nameEmbedding: node.nameEmbedding },
      );
      return results[0].uuid;
    } else {
      const results = await this.neo4j.executeWrite<{ uuid: string }>(
        // labelStr is safe to interpolate — validateNodeLabels ensures only [A-Za-z_][A-Za-z0-9_]* chars
        /* cypher */ `MERGE (n:${labelStr} {uuid: $uuid})
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
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Entity {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Entity) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteIfSoleMentioned(nodeUuid: string): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `MATCH (ep:Episodic)-[:MENTIONS]->(n:Entity {uuid: $nodeUuid})
       WITH n, count(ep) AS cnt
       WHERE cnt = 1
       DETACH DELETE n`,
      { nodeUuid },
    );
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Entity {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: string): Promise<EntityNode | null> {
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

  async getByUuids(uuids: string[]): Promise<EntityNode[]> {
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

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
  ): Promise<EntityNode[]> {
    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const params: Record<string, unknown> = { groupIds };
    if (limit !== undefined) params['limit'] = limit;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Entity) WHERE n.group_id IN $groupIds
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels
       ${limitClause}`,
      params,
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchByName(
    query: string,
    groupIds: string[],
    limit: number,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { clause, params: filterParams } = filters
      ? buildNodeFilterClause(filters, 'n')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `CALL db.index.fulltext.queryNodes('entity_names', $query)
       YIELD node AS n, score
       WHERE n.group_id IN $groupIds${whereExtra}
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels
       ORDER BY score DESC
       LIMIT $limit`,
      { query: luceneSanitize(query), groupIds, limit, ...filterParams },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchBySimilarity(
    embedding: number[],
    groupIds: string[],
    limit: number,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { clause, params: filterParams } = filters
      ? buildNodeFilterClause(filters, 'n')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `CALL db.index.vector.queryNodes('entity_names_embedding', $limit, $embedding)
       YIELD node AS n, score
       WHERE n.group_id IN $groupIds${whereExtra}
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.summary AS summary,
              n.attributes AS attributes, n.name_embedding AS name_embedding,
              labels(n) AS labels`,
      { embedding, groupIds, limit, ...filterParams },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchByBfs(
    originNodeUuids: string[],
    groupIds: string[],
    limit: number,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    if (originNodeUuids.length === 0) return [];

    const { clause, params: filterParams } = filters
      ? buildNodeFilterClause(filters, 'reachable')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    // Variable-length paths cannot use a parameter for depth in Cypher — depth
    // is hardcoded to MAX_SEARCH_DEPTH (3) to match the Python Graphiti default.
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (origin:Entity)
       WHERE origin.uuid IN $originNodeUuids AND origin.group_id IN $groupIds
       MATCH (origin)-[:RELATES_TO*1..3]-(reachable:Entity)
       WHERE reachable.group_id IN $groupIds${whereExtra}
       RETURN DISTINCT reachable.uuid AS uuid, reachable.name AS name,
              reachable.group_id AS group_id, reachable.created_at AS created_at,
              reachable.summary AS summary, reachable.attributes AS attributes,
              reachable.name_embedding AS name_embedding, labels(reachable) AS labels
       LIMIT $limit`,
      { originNodeUuids, groupIds, limit, ...filterParams },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): EntityNode {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      createdAt: row['created_at'] as Date,
      summary: (row['summary'] as string) ?? '',
      attributes: row['attributes']
        ? (JSON.parse(row['attributes'] as string) as Record<string, unknown>)
        : {},
      nameEmbedding: (row['name_embedding'] as number[] | null) ?? null,
      labels: (row['labels'] as string[]) ?? ['Entity'],
    };
  }
}
