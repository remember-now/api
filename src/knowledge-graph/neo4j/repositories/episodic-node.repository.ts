import { Injectable, OnModuleInit } from '@nestjs/common';

import { EpisodicNode } from '@/knowledge-graph/models';
import { toNeo4jDateTime } from '@/knowledge-graph/neo4j/neo4j-utils';
import { buildFulltextQuery } from '@/knowledge-graph/neo4j/neo4j-utils';
import {
  EpisodeType,
  GetByGroupIdsParams,
  GroupId,
  RetrieveEpisodesParams,
  SearchByTextParams,
  Uuid,
} from '@/knowledge-graph/neo4j/neo4j.schemas';
import { Neo4jService } from '@/knowledge-graph/neo4j/neo4j.service';
import {
  buildLabelString,
  groupNodesByLabel,
} from '@/knowledge-graph/neo4j/node-label.utils';

@Injectable()
export class EpisodicNodeRepository implements OnModuleInit {
  constructor(private readonly neo4j: Neo4jService) {}

  async onModuleInit(): Promise<void> {
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE FULLTEXT INDEX episode_content IF NOT EXISTS
       FOR (n:Episodic) ON EACH [n.content, n.source, n.source_description, n.group_id]`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX episodic_group_id IF NOT EXISTS FOR (n:Episodic) ON (n.group_id)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX episode_uuid IF NOT EXISTS FOR (n:Episodic) ON (n.uuid)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX created_at_episodic_index IF NOT EXISTS FOR (n:Episodic) ON (n.created_at)`,
      {},
    );
    await this.neo4j.executeWrite(
      /* cypher */ `CREATE INDEX valid_at_episodic_index IF NOT EXISTS FOR (n:Episodic) ON (n.valid_at)`,
      {},
    );
  }

  async save(node: EpisodicNode): Promise<string> {
    const labelStr = buildLabelString(node.labels);
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
          source: node.source,
          source_description: node.sourceDescription,
          content: node.content,
          valid_at: toNeo4jDateTime(node.validAt),
          entity_edges: node.entityEdges,
        },
      },
    );
    return results[0].uuid;
  }

  async saveBulk(nodes: EpisodicNode[]): Promise<void> {
    if (nodes.length === 0) return;

    for (const [labelStr, group] of groupNodesByLabel(nodes)) {
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
              source: n.source,
              source_description: n.sourceDescription,
              content: n.content,
              valid_at: toNeo4jDateTime(n.validAt),
              entity_edges: n.entityEdges,
            },
          })),
        },
      );
    }
  }

  async delete(uuid: Uuid): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Episodic {uuid: $uuid}) DETACH DELETE n',
      { uuid },
    );
  }

  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Episodic) WHERE n.uuid IN $uuids DETACH DELETE n',
      { uuids },
    );
  }

  async deleteByGroupId(groupId: GroupId): Promise<void> {
    await this.neo4j.executeWrite(
      '/*cypher*/ MATCH (n:Episodic {group_id: $groupId}) DETACH DELETE n',
      { groupId },
    );
  }

  async getByUuid(uuid: Uuid): Promise<EpisodicNode | null> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Episodic {uuid: $uuid})
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.source AS source,
              n.source_description AS source_description, n.content AS content,
              n.valid_at AS valid_at, n.entity_edges AS entity_edges,
              labels(n) AS labels`,
      { uuid },
    );
    if (!results.length) return null;
    return this.mapRow(results[0]);
  }

  async getByUuids(uuids: Uuid[]): Promise<EpisodicNode[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Episodic) WHERE n.uuid IN $uuids
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.source AS source,
              n.source_description AS source_description, n.content AS content,
              n.valid_at AS valid_at, n.entity_edges AS entity_edges,
              labels(n) AS labels`,
      { uuids },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByGroupIds(params: GetByGroupIdsParams): Promise<EpisodicNode[]> {
    const { groupIds, limit } = params;
    const limitClause = limit !== undefined ? 'LIMIT $limit' : '';
    const queryParams: Record<string, unknown> = { groupIds };
    if (limit !== undefined) queryParams['limit'] = limit;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (n:Episodic) WHERE n.group_id IN $groupIds
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.source AS source,
              n.source_description AS source_description, n.content AS content,
              n.valid_at AS valid_at, n.entity_edges AS entity_edges,
              labels(n) AS labels
       ${limitClause}`,
      queryParams,
    );
    return results.map((r) => this.mapRow(r));
  }

  async getByEntityNodeUuid(entityNodeUuid: Uuid): Promise<EpisodicNode[]> {
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (e:Episodic)-[:MENTIONS]->(:Entity {uuid: $entityNodeUuid})
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.source AS source,
              e.source_description AS source_description, e.content AS content,
              e.valid_at AS valid_at, e.entity_edges AS entity_edges,
              labels(e) AS labels`,
      { entityNodeUuid },
    );
    return results.map((r) => this.mapRow(r));
  }

  async retrieveEpisodes(
    params: RetrieveEpisodesParams,
  ): Promise<EpisodicNode[]> {
    const { referenceTime, groupIds, source, sagaUuid, lastN } = params;
    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `MATCH (e:Episodic)
       WHERE e.valid_at <= $referenceTime
       AND ($groupIds IS NULL OR e.group_id IN $groupIds)
       AND ($source IS NULL OR e.source = $source)
       AND ($sagaUuid IS NULL OR EXISTS { (:Saga {uuid: $sagaUuid})-[:HAS_EPISODE]->(e) })
       ORDER BY e.valid_at DESC
       LIMIT $lastN
       RETURN e.uuid AS uuid, e.name AS name, e.group_id AS group_id,
              e.created_at AS created_at, e.source AS source,
              e.source_description AS source_description, e.content AS content,
              e.valid_at AS valid_at, e.entity_edges AS entity_edges,
              labels(e) AS labels`,
      {
        referenceTime,
        groupIds: groupIds ?? null,
        source: source ?? null,
        sagaUuid: sagaUuid ?? null,
        lastN,
      },
    );
    return results.map((r) => this.mapRow(r));
  }

  async getMentionedEntityUuids(episodeUuid: Uuid): Promise<Uuid[]> {
    const results = await this.neo4j.executeRead<{ uuid: Uuid }>(
      /* cypher */ `MATCH (ep:Episodic {uuid: $episodeUuid})-[:MENTIONS]->(n:Entity)
       RETURN n.uuid AS uuid`,
      { episodeUuid },
    );
    return results.map((r) => r.uuid);
  }

  async searchByContent(params: SearchByTextParams): Promise<EpisodicNode[]> {
    const { query, groupIds, limit } = params;

    const results = await this.neo4j.executeRead<Record<string, unknown>>(
      /* cypher */ `CALL db.index.fulltext.queryNodes('episode_content', $luceneQuery)
       YIELD node AS n, score
       RETURN n.uuid AS uuid, n.name AS name, n.group_id AS group_id,
              n.created_at AS created_at, n.source AS source,
              n.source_description AS source_description, n.content AS content,
              n.valid_at AS valid_at, n.entity_edges AS entity_edges,
              labels(n) AS labels
       ORDER BY score DESC
       LIMIT $limit`,
      {
        luceneQuery: buildFulltextQuery(query, groupIds),
        limit,
      },
    );
    return results.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): EpisodicNode {
    return {
      uuid: row['uuid'] as Uuid,
      name: row['name'] as string,
      groupId: row['group_id'] as GroupId,
      labels: row['labels'] as string[],
      createdAt: row['created_at'] as Date,
      source: (row['source'] as EpisodeType) ?? EpisodeType.text,
      sourceDescription: (row['source_description'] as string) ?? '',
      content: (row['content'] as string) ?? '',
      validAt: row['valid_at'] as Date,
      entityEdges: (row['entity_edges'] as Uuid[]) ?? [],
    };
  }
}
