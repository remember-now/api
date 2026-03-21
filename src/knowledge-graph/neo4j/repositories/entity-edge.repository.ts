import { Injectable, OnModuleInit } from '@nestjs/common';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { EntityEdge } from '@/knowledge-graph/models/edges/entity-edge';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { buildEdgeFilterClause } from '@/knowledge-graph/search/search-filters';
import { SearchFilters } from '@/knowledge-graph/search/search-filters.types';

@Injectable()
export class EntityEdgeRepository implements OnModuleInit {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.neo4j.runQuery(
        /* cypher */ `CREATE FULLTEXT INDEX edge_facts IF NOT EXISTS
         FOR ()-[r:RELATES_TO]-()
         ON EACH [r.fact]`,
        {},
      ),
      this.neo4j.runQuery(
        /* cypher */ `CREATE VECTOR INDEX edge_facts_embedding IF NOT EXISTS
         FOR ()-[r:RELATES_TO]-() ON r.fact_embedding
         OPTIONS {indexConfig: {\`vector.dimensions\`: $dims, \`vector.similarity_function\`: 'cosine'}}`,
        { dims: this.embeddingService.dimensions },
      ),
    ]);
  }

  async save(edge: EntityEdge): Promise<string> {
    const props: Record<string, unknown> = {
      name: edge.name,
      group_id: edge.groupId,
      created_at: toNeo4jDateTime(edge.createdAt),
      fact: edge.fact,
      episodes: edge.episodes,
      expired_at: edge.expiredAt ? toNeo4jDateTime(edge.expiredAt) : null,
      valid_at: edge.validAt ? toNeo4jDateTime(edge.validAt) : null,
      invalid_at: edge.invalidAt ? toNeo4jDateTime(edge.invalidAt) : null,
      attributes: JSON.stringify(edge.attributes),
    };

    if (edge.factEmbedding) {
      const results = await this.neo4j.runQuery<{ uuid: string }>(
        /* cypher */ `MATCH (source:Entity {uuid: $sourceNodeUuid})
         MATCH (target:Entity {uuid: $targetNodeUuid})
         MERGE (source)-[e:RELATES_TO {uuid: $uuid}]->(target)
         SET e += $props
         WITH e CALL db.create.setRelationshipVectorProperty(e, 'fact_embedding', $factEmbedding)
         RETURN e.uuid AS uuid`,
        {
          uuid: edge.uuid,
          sourceNodeUuid: edge.sourceNodeUuid,
          targetNodeUuid: edge.targetNodeUuid,
          props,
          factEmbedding: edge.factEmbedding,
        },
      );
      return results[0].uuid;
    } else {
      const results = await this.neo4j.runQuery<{ uuid: string }>(
        /* cypher */ `MATCH (source:Entity {uuid: $sourceNodeUuid})
         MATCH (target:Entity {uuid: $targetNodeUuid})
         MERGE (source)-[e:RELATES_TO {uuid: $uuid}]->(target)
         SET e += $props
         RETURN e.uuid AS uuid`,
        {
          uuid: edge.uuid,
          sourceNodeUuid: edge.sourceNodeUuid,
          targetNodeUuid: edge.targetNodeUuid,
          props,
        },
      );
      return results[0].uuid;
    }
  }

  async saveBulk(edges: EntityEdge[]): Promise<void> {
    await Promise.all(edges.map((e) => this.save(e)));
  }

  async delete(uuid: string): Promise<void> {
    await this.neo4j.runQuery(
      '/*cypher*/ MATCH ()-[e:RELATES_TO {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.runQuery(
      '/*cypher*/ MATCH ()-[e:RELATES_TO]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: string): Promise<EntityEdge | null> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Entity)-[e:RELATES_TO {uuid: $uuid}]->(target:Entity)
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: string[]): Promise<EntityEdge[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
       WHERE e.uuid IN $uuids
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(
    groupIds: string[],
    limit?: number,
  ): Promise<EntityEdge[]> {
    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const params: Record<string, unknown> = { groupIds };
    if (limit !== undefined) params['limit'] = limit;
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
       WHERE e.group_id IN $groupIds
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid
       ${limitClause}`,
      params,
    );
    return results.map((r) => this.mapRow(r));
  }

  async getBetweenNodes(
    sourceUuid: string,
    targetUuid: string,
  ): Promise<EntityEdge[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Entity {uuid: $sourceUuid})-[e:RELATES_TO]->(target:Entity {uuid: $targetUuid})
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid`,
      { sourceUuid, targetUuid },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByNodeUuid(nodeUuid: string): Promise<EntityEdge[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
       WHERE source.uuid = $nodeUuid OR target.uuid = $nodeUuid
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid`,
      { nodeUuid },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchByFact(
    query: string,
    groupIds: string[],
    limit: number,
  ): Promise<EntityEdge[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `CALL db.index.fulltext.queryRelationships('edge_facts', $query)
       YIELD relationship AS e, score
       WHERE e.group_id IN $groupIds
       MATCH (source:Entity)-[e]->(target:Entity)
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid
       ORDER BY score DESC
       LIMIT $limit`,
      { query, groupIds, limit },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchBySimilarity(
    embedding: number[],
    groupIds: string[],
    limit: number,
    filters?: SearchFilters,
  ): Promise<EntityEdge[]> {
    const { clause, params: filterParams } = filters
      ? buildEdgeFilterClause(filters, 'e')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `CALL db.index.vector.queryRelationships('edge_facts_embedding', $limit, $embedding)
       YIELD relationship AS e, score
       WHERE e.group_id IN $groupIds${whereExtra}
       MATCH (source:Entity)-[e]->(target:Entity)
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid`,
      { embedding, groupIds, limit, ...filterParams },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchByBfs(
    originNodeUuids: string[],
    groupIds: string[],
    limit: number,
    filters?: SearchFilters,
  ): Promise<EntityEdge[]> {
    if (originNodeUuids.length === 0) return [];

    const { clause, params: filterParams } = filters
      ? buildEdgeFilterClause(filters, 'e')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    // Variable-length paths cannot use a parameter for depth in Cypher — depth
    // is hardcoded to MAX_SEARCH_DEPTH (3) to match the Python Graphiti default.
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      /* cypher */ `MATCH (origin:Entity)
       WHERE origin.uuid IN $originNodeUuids AND origin.group_id IN $groupIds
       MATCH (origin)-[:RELATES_TO*0..3]-(connected:Entity)
       WHERE connected.group_id IN $groupIds
       WITH collect(DISTINCT connected.uuid) AS reachableUuids
       MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
       WHERE e.group_id IN $groupIds
         AND source.uuid IN reachableUuids
         AND target.uuid IN reachableUuids${whereExtra}
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid
       LIMIT $limit`,
      { originNodeUuids, groupIds, limit, ...filterParams },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): EntityEdge {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      createdAt: row['created_at'] as Date,
      sourceNodeUuid: row['source_node_uuid'] as string,
      targetNodeUuid: row['target_node_uuid'] as string,
      fact: (row['fact'] as string) ?? '',
      factEmbedding: (row['fact_embedding'] as number[] | null) ?? null,
      episodes: (row['episodes'] as string[]) ?? [],
      expiredAt: (row['expired_at'] as Date | null) ?? null,
      validAt: (row['valid_at'] as Date | null) ?? null,
      invalidAt: (row['invalid_at'] as Date | null) ?? null,
      attributes: row['attributes']
        ? (JSON.parse(row['attributes'] as string) as Record<string, unknown>)
        : {},
    };
  }
}
