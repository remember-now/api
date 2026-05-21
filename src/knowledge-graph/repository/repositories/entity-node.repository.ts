import { Injectable } from '@nestjs/common';

import { Prisma } from '@generated/prisma/client';

import { Uuid } from '@/common/schemas';
import { EntityNode } from '@/knowledge-graph/models';
import { MAX_SEARCH_DEPTH, SearchFilters } from '@/knowledge-graph/search/types';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import {
  NodeLabels,
  NodeName,
  SearchByBfsParams,
  SearchBySimilarityParams,
  SearchByTextParams,
} from '../../types';
import { buildBfsCte } from '../bfs-cte';
import { fromPgVector, toPgVector } from '../pgvector-utils';
import { buildNodeFilterClause } from '../sql-filter-builders';

type RawRow = {
  id: string;
  graph_id: string;
  name: string;
  created_at: Date;
  summary: string | null;
  attributes: unknown;
  name_embedding: string | null;
  labels: string[] | null;
};

@Injectable()
export class EntityNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  @Span()
  async save(node: EntityNode): Promise<string> {
    await this.prisma.$executeRaw`
      INSERT INTO entity_nodes (id, graph_id, name, summary, attributes, labels, name_embedding, created_at)
      VALUES (
        ${node.uuid}::uuid,
        ${node.graphId}::uuid,
        ${node.name},
        ${node.summary},
        ${JSON.stringify(node.attributes)}::jsonb,
        ${node.labels}::text[],
        ${toPgVector(node.nameEmbedding)}::vector,
        ${node.createdAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        graph_id       = EXCLUDED.graph_id,
        name           = EXCLUDED.name,
        summary        = EXCLUDED.summary,
        attributes     = EXCLUDED.attributes,
        labels         = EXCLUDED.labels,
        name_embedding = EXCLUDED.name_embedding
    `;
    return node.uuid;
  }

  @Span()
  async saveBulk(nodes: EntityNode[]): Promise<void> {
    if (nodes.length === 0) return;
    // Sequential single-row UPSERTs keep parameter binding simple and stay
    // within Postgres' bind-parameter limit on large batches. The save() above
    // is itself a single round trip; bulk amortizes only client-side overhead.
    for (const node of nodes) {
      await this.save(node);
    }
  }

  @Span()
  async deleteIfSoleMentioned(nodeUuid: Uuid): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM entity_nodes en
      WHERE en.id = ${nodeUuid}::uuid
        AND (SELECT COUNT(*) FROM episodic_edges ee WHERE ee.entity_id = en.id) = 1
    `;
  }

  @Span()
  async searchByName(
    params: SearchByTextParams,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { query, graphIds, limit } = params;
    if (graphIds.length === 0) return [];
    const tsquery = Prisma.sql`plainto_tsquery('english', ${query})`;
    const filterSql = buildNodeFilterClause(filters, 'n');

    const rows = await this.prisma.$queryRaw<(RawRow & { score: number })[]>`
      SELECT n.id, n.graph_id, n.name, n.summary, n.attributes, n.labels,
             n.name_embedding::text AS name_embedding, n.created_at,
             ts_rank(to_tsvector('english', n.name || ' ' || n.summary), ${tsquery}) AS score
      FROM entity_nodes n
      WHERE n.graph_id = ANY(${graphIds}::uuid[])
        AND to_tsvector('english', n.name || ' ' || n.summary) @@ ${tsquery}
        ${filterSql}
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async searchBySimilarity(
    params: SearchBySimilarityParams,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { embedding, graphIds, limit, minScore } = params;
    if (graphIds.length === 0) return [];
    const vec = Prisma.sql`${toPgVector(embedding)}::vector`;
    const filterSql = buildNodeFilterClause(filters, 'n');

    // graph_label && ARRAY[graph_label_for(id1), graph_label_for(id2), ...]
    // narrows the diskann scan to label buckets containing any of our graphs.
    // graph_id = ANY(...) post-filters out bucket-mates from other graphs.
    // https://github.com/timescale/pgvectorscale?tab=readme-ov-file#label-based-filtering-with-diskann
    const labelArray = Prisma.sql`ARRAY[${Prisma.join(
      graphIds.map((g) => Prisma.sql`graph_label_for(${g}::uuid)`),
    )}]::smallint[]`;

    const rows = await this.prisma.$queryRaw<(RawRow & { score: number })[]>`
      SELECT n.id, n.graph_id, n.name, n.summary, n.attributes, n.labels,
             n.name_embedding::text AS name_embedding, n.created_at,
             1 - (n.name_embedding <=> ${vec}) AS score
      FROM entity_nodes n
      WHERE n.graph_label && ${labelArray}
        AND n.graph_id = ANY(${graphIds}::uuid[])
        AND n.name_embedding IS NOT NULL
        AND 1 - (n.name_embedding <=> ${vec}) >= ${minScore}
        ${filterSql}
      ORDER BY n.name_embedding <=> ${vec}
      LIMIT ${limit}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async searchByBfs(
    params: SearchByBfsParams,
    filters?: SearchFilters,
  ): Promise<EntityNode[]> {
    const { originNodeUuids, graphIds, limit, maxDepth } = params;
    if (originNodeUuids.length === 0) return [];
    const depth = maxDepth ?? MAX_SEARCH_DEPTH;
    const filterSql = buildNodeFilterClause(filters, 'reachable');
    const cte = buildBfsCte(originNodeUuids, graphIds, depth);
    const rows = await this.prisma.$queryRaw<RawRow[]>`
      ${cte}
      SELECT DISTINCT reachable.id, reachable.graph_id, reachable.name, reachable.summary,
                      reachable.attributes, reachable.labels,
                      reachable.name_embedding::text AS name_embedding, reachable.created_at
      FROM bfs b
      JOIN entity_nodes reachable ON reachable.id = b.id
      WHERE reachable.graph_id = ANY(${graphIds}::uuid[])
        AND b.depth > 0
        ${filterSql}
      LIMIT ${limit}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  // Currently emits only 1-hop scores (score=1 for direct neighbors, absent otherwise).
  // The reranker treats score as graph distance with harmonic decay (1/d), so this can be
  // extended to multi-hop via BFS (e.g. buildBfsCte) without changing the caller contract.
  @Span()
  async getNodeDistanceScores(
    nodeUuids: Uuid[],
    centerNodeUuid: Uuid,
  ): Promise<{ uuid: Uuid; score: number }[]> {
    if (nodeUuids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ uuid: Uuid; score: number }[]>`
      SELECT DISTINCT n.id AS uuid, 1 AS score
      FROM UNNEST(${nodeUuids}::uuid[]) AS n(id)
      JOIN entity_edges ee
        ON (ee.source_id = ${centerNodeUuid}::uuid AND ee.target_id = n.id)
        OR (ee.target_id = ${centerNodeUuid}::uuid AND ee.source_id = n.id)
    `;
    return rows;
  }

  @Span()
  async getEpisodeMentionCounts(
    nodeUuids: Uuid[],
  ): Promise<{ uuid: Uuid; score: number }[]> {
    if (nodeUuids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ uuid: Uuid; score: number }[]>`
      SELECT n.id AS uuid, COUNT(ee.id)::int AS score
      FROM UNNEST(${nodeUuids}::uuid[]) AS n(id)
      LEFT JOIN episodic_edges ee ON ee.entity_id = n.id
      GROUP BY n.id
    `;
    return rows;
  }

  private mapRow(row: RawRow): EntityNode {
    const attrs = row.attributes;
    return {
      uuid: row.id as Uuid,
      name: row.name as NodeName,
      graphId: row.graph_id as Uuid,
      createdAt: row.created_at,
      summary: row.summary ?? '',
      attributes:
        attrs && typeof attrs === 'object' ? (attrs as Record<string, unknown>) : {},
      nameEmbedding: fromPgVector(row.name_embedding),
      labels: (row.labels ?? []) as NodeLabels,
    };
  }
}
