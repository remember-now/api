import { Injectable, OnModuleInit } from '@nestjs/common';

import { EmbeddingService } from '@/knowledge-graph/embedding/embedding.service';
import { EntityEdge } from '@/knowledge-graph/models';
import { buildEdgeFilterClause } from '@/knowledge-graph/neo4j/cypher-filter-builders';
import {
  fromNeo4jInt,
  toNeo4jDateTime,
  toNeo4jInt,
} from '@/knowledge-graph/neo4j/neo4j-utils';
import { buildFulltextQuery } from '@/knowledge-graph/neo4j/neo4j-utils';
import {
  GetByGroupIdsParams,
  GroupId,
  SearchByBfsParams,
  SearchBySimilarityParams,
  SearchByTextParams,
  Uuid,
  UuidArray,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import { MAX_SEARCH_DEPTH } from '@/knowledge-graph/search/search-config.types';
import { SearchFilters } from '@/knowledge-graph/search/search-filters.types';

@Injectable()
export class EntityEdgeRepository implements OnModuleInit {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE FULLTEXT INDEX edge_facts IF NOT EXISTS
       FOR ()-[r:RELATES_TO]-()
       ON EACH [r.name, r.fact, r.group_id]`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE VECTOR INDEX edge_facts_embedding IF NOT EXISTS
       FOR ()-[r:RELATES_TO]-() ON r.fact_embedding
       WITH [r.group_id]
       OPTIONS {indexConfig: {\`vector.dimensions\`: $dims, \`vector.similarity_function\`: 'cosine'}}`,
      { dims: toNeo4jInt(this.embeddingService.dimensions) },
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX entity_edge_group_id IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.group_id)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX relation_uuid IF NOT EXISTS FOR ()-[e:RELATES_TO]-() ON (e.uuid)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX name_edge_index IF NOT EXISTS FOR ()-[e:RELATES_TO]-() ON (e.name)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX created_at_edge_index IF NOT EXISTS FOR ()-[e:RELATES_TO]-() ON (e.created_at)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX expired_at_edge_index IF NOT EXISTS FOR ()-[e:RELATES_TO]-() ON (e.expired_at)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX valid_at_edge_index IF NOT EXISTS FOR ()-[e:RELATES_TO]-() ON (e.valid_at)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX invalid_at_edge_index IF NOT EXISTS FOR ()-[e:RELATES_TO]-() ON (e.invalid_at)`,
      {},
    );
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
      const results = await this.neo4j.executeWrite<{ uuid: string }>(
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
      const results = await this.neo4j.executeWrite<{ uuid: string }>(
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
    if (edges.length === 0) return;
    const withEmbedding = edges.filter((e) => e.factEmbedding);
    const withoutEmbedding = edges.filter((e) => !e.factEmbedding);

    const toRow = (e: EntityEdge) => ({
      uuid: e.uuid,
      sourceNodeUuid: e.sourceNodeUuid,
      targetNodeUuid: e.targetNodeUuid,
      props: {
        name: e.name,
        group_id: e.groupId,
        created_at: toNeo4jDateTime(e.createdAt),
        fact: e.fact,
        episodes: e.episodes,
        expired_at: e.expiredAt ? toNeo4jDateTime(e.expiredAt) : null,
        valid_at: e.validAt ? toNeo4jDateTime(e.validAt) : null,
        invalid_at: e.invalidAt ? toNeo4jDateTime(e.invalidAt) : null,
        attributes: JSON.stringify(e.attributes),
      },
    });

    if (withoutEmbedding.length > 0) {
      await this.neo4j.executeWrite(
        /* cypher */ `UNWIND $edges AS edge
         MATCH (source:Entity {uuid: edge.sourceNodeUuid})
         MATCH (target:Entity {uuid: edge.targetNodeUuid})
         MERGE (source)-[e:RELATES_TO {uuid: edge.uuid}]->(target)
         SET e += edge.props`,
        { edges: withoutEmbedding.map(toRow) },
      );
    }

    if (withEmbedding.length > 0) {
      await this.neo4j.executeWrite(
        /* cypher */ `UNWIND $edges AS edge
         MATCH (source:Entity {uuid: edge.sourceNodeUuid})
         MATCH (target:Entity {uuid: edge.targetNodeUuid})
         MERGE (source)-[e:RELATES_TO {uuid: edge.uuid}]->(target)
         SET e += edge.props
         WITH e, edge
         CALL db.create.setRelationshipVectorProperty(e, 'fact_embedding', edge.factEmbedding)`,
        {
          edges: withEmbedding.map((e) => ({
            ...toRow(e),
            factEmbedding: e.factEmbedding,
          })),
        },
      );
    }
  }

  async delete(uuid: Uuid): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:RELATES_TO {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: UuidArray): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH ()-[e:RELATES_TO]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: Uuid): Promise<EntityEdge | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
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

  async getByUuids(uuids: UuidArray): Promise<EntityEdge[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
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

  async getUuidsForEpisodeDeletion(episodeUuid: Uuid): Promise<Uuid[]> {
    const results = await this.neo4j.executeRead<{ uuid: Uuid }>(
      // episodes[0] is the creating episode — mirrors Python graphiti.py remove_episode:
      // only edges whose first episode matches are deleted; edges that merely accumulated
      // this episode as a contributor (episodes[1..]) are intentionally kept.
      /* cypher */ `MATCH ()-[e:RELATES_TO]->()
       WHERE e.episodes[0] = $episodeUuid
       RETURN e.uuid AS uuid`,
      { episodeUuid },
    );
    return results.map((r) => r.uuid);
  }

  async getByGroupIds(params: GetByGroupIdsParams): Promise<EntityEdge[]> {
    const { groupIds, limit } = params;
    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const queryParams: Record<string, unknown> = { groupIds };
    if (limit !== undefined) queryParams['limit'] = limit;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
       WHERE e.group_id IN $groupIds
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid
       ${limitClause}`,
      queryParams,
    );
    return results.map((r) => this.mapRow(r));
  }

  async getBetweenNodes(
    sourceUuid: Uuid,
    targetUuid: Uuid,
  ): Promise<EntityEdge[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
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

  async getByNodeUuid(nodeUuid: Uuid): Promise<EntityEdge[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
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

  async searchByFact(params: SearchByTextParams): Promise<EntityEdge[]> {
    const { query, groupIds, limit } = params;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `CALL db.index.fulltext.queryRelationships('edge_facts', $luceneQuery)
       YIELD relationship AS e, score
       MATCH (source:Entity)-[e]->(target:Entity)
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid
       ORDER BY score DESC
       LIMIT $limit`,
      {
        luceneQuery: buildFulltextQuery(query, groupIds),
        limit,
      },
    );
    return results.map((r) => this.mapRow(r));
  }

  async searchBySimilarity(
    params: SearchBySimilarityParams,
    filters?: SearchFilters,
  ): Promise<EntityEdge[]> {
    const { embedding, groupIds, limit, minScore } = params;
    if (groupIds.length === 0) return [];

    const { clause, params: filterParams } = filters
      ? buildEdgeFilterClause(filters, 'e')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    const perGroup = await Promise.all(
      groupIds.map((groupId) =>
        this.neo4j.executeRead<Record<string, unknown>>(
          /* cypher */ `MATCH ()-[e:RELATES_TO]->()
           SEARCH e IN (
             VECTOR INDEX edge_facts_embedding
             FOR $embedding
             WHERE e.group_id = $groupId
             LIMIT $limit
           ) SCORE AS score
           WHERE score >= $minScore${whereExtra}
           WITH e, score, startNode(e) AS source, endNode(e) AS target
           RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
                  e.created_at AS created_at, e.fact AS fact,
                  e.fact_embedding AS fact_embedding, e.episodes AS episodes,
                  e.expired_at AS expired_at, e.valid_at AS valid_at,
                  e.invalid_at AS invalid_at, e.attributes AS attributes,
                  source.uuid AS source_node_uuid, target.uuid AS target_node_uuid, score`,
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
  ): Promise<EntityEdge[]> {
    const { originNodeUuids, groupIds, limit, maxDepth } = params;
    if (originNodeUuids.length === 0) return [];

    const depth =
      maxDepth !== undefined ? fromNeo4jInt(maxDepth) : MAX_SEARCH_DEPTH;

    const { clause, params: filterParams } = filters
      ? buildEdgeFilterClause(filters, 'e')
      : { clause: '', params: {} };
    const whereExtra = clause ? ` AND ${clause}` : '';

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (origin:Entity|Episodic)
       WHERE origin.uuid IN $originNodeUuids AND origin.group_id IN $groupIds
       MATCH (origin)-[:RELATES_TO|MENTIONS*1..${depth}]-(connected:Entity)
       WHERE connected.group_id IN $groupIds
       WITH $originNodeUuids + collect(DISTINCT connected.uuid) AS reachableUuids
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
      {
        originNodeUuids,
        groupIds,
        limit,
        ...filterParams,
      },
    );
    return results.map((r) => this.mapRow(r));
  }

  async hasRelatesEdgesForGroup(groupId: GroupId): Promise<boolean> {
    const results = await this.neo4j.executeRead<{ hasEdges: boolean }>(
      /* cypher */ `MATCH (n:Entity {group_id: $groupId})-[:RELATES_TO]-() RETURN count(n) > 0 AS hasEdges`,
      { groupId },
    );
    return results[0]?.hasEdges ?? false;
  }

  private mapRow(row: Record<string, unknown>): EntityEdge {
    return {
      uuid: row['uuid'] as Uuid,
      name: row['name'] as string,
      groupId: row['group_id'] as GroupId,
      createdAt: row['created_at'] as Date,
      sourceNodeUuid: row['source_node_uuid'] as Uuid,
      targetNodeUuid: row['target_node_uuid'] as Uuid,
      fact: (row['fact'] as string) ?? '',
      factEmbedding: (row['fact_embedding'] as number[] | null) ?? null,
      episodes: (row['episodes'] as Uuid[]) ?? [],
      expiredAt: (row['expired_at'] as Date | null) ?? null,
      validAt: (row['valid_at'] as Date | null) ?? null,
      invalidAt: (row['invalid_at'] as Date | null) ?? null,
      attributes: row['attributes']
        ? (JSON.parse(row['attributes'] as string) as Record<string, unknown>)
        : {},
    };
  }
}
