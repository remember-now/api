import { Injectable } from '@nestjs/common';

import { EntityEdge } from '@/knowledge-graph/models/edges/entity-edge';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';

@Injectable()
export class EntityEdgeRepository {
  constructor(private readonly neo4j: Neo4jService) {}

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
        `MATCH (source:Entity {uuid: $sourceNodeUuid})
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
        `MATCH (source:Entity {uuid: $sourceNodeUuid})
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
      'MATCH ()-[e:RELATES_TO {uuid: $uuid}]->() DELETE e',
      { uuid },
    );
  }

  async deleteByUuids(uuids: string[]): Promise<void> {
    await this.neo4j.runQuery(
      'MATCH ()-[e:RELATES_TO]->() WHERE e.uuid IN $uuids DELETE e',
      { uuids },
    );
  }

  async getByUuid(uuid: string): Promise<EntityEdge | null> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (source:Entity)-[e:RELATES_TO {uuid: $uuid}]->(target:Entity)
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
      `MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
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
    uuidCursor?: string,
  ): Promise<EntityEdge[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const cursorClause = uuidCursor ? 'AND e.uuid > $uuidCursor' : '';
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
       WHERE e.group_id IN $groupIds ${cursorClause}
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.fact AS fact,
              e.fact_embedding AS fact_embedding, e.episodes AS episodes,
              e.expired_at AS expired_at, e.valid_at AS valid_at,
              e.invalid_at AS invalid_at, e.attributes AS attributes,
              source.uuid AS source_node_uuid, target.uuid AS target_node_uuid
       ${limitClause}`,
      { groupIds, uuidCursor: uuidCursor ?? null },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getBetweenNodes(
    sourceUuid: string,
    targetUuid: string,
  ): Promise<EntityEdge[]> {
    const results = await this.neo4j.runQuery<Record<string, unknown>>(
      `MATCH (source:Entity {uuid: $sourceUuid})-[e:RELATES_TO]->(target:Entity {uuid: $targetUuid})
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
      `MATCH (source:Entity)-[e:RELATES_TO]->(target:Entity)
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

  private mapRow(row: Record<string, unknown>): EntityEdge {
    return {
      uuid: row['uuid'] as string,
      name: row['name'] as string,
      groupId: row['group_id'] as string,
      createdAt:
        row['created_at'] instanceof Date
          ? row['created_at']
          : new Date(row['created_at'] as string),
      sourceNodeUuid: row['source_node_uuid'] as string,
      targetNodeUuid: row['target_node_uuid'] as string,
      fact: (row['fact'] as string) ?? '',
      factEmbedding: (row['fact_embedding'] as number[] | null) ?? null,
      episodes: (row['episodes'] as string[]) ?? [],
      expiredAt: row['expired_at']
        ? row['expired_at'] instanceof Date
          ? row['expired_at']
          : new Date(row['expired_at'] as string)
        : null,
      validAt: row['valid_at']
        ? row['valid_at'] instanceof Date
          ? row['valid_at']
          : new Date(row['valid_at'] as string)
        : null,
      invalidAt: row['invalid_at']
        ? row['invalid_at'] instanceof Date
          ? row['invalid_at']
          : new Date(row['invalid_at'] as string)
        : null,
      attributes: row['attributes']
        ? (JSON.parse(row['attributes'] as string) as Record<string, unknown>)
        : {},
    };
  }
}
