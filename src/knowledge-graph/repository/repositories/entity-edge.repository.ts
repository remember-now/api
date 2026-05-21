import { Injectable } from '@nestjs/common';

import { Prisma } from '@generated/prisma/client';

import { Uuid } from '@/common/schemas';
import { EntityEdge } from '@/knowledge-graph/models';
import { MAX_SEARCH_DEPTH, SearchFilters } from '@/knowledge-graph/search/types';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import {
  GetByGraphIdsParams,
  RelationshipType,
  SearchByBfsParams,
  SearchBySimilarityParams,
  SearchByTextParams,
} from '../../types';
import { buildBfsCte } from '../bfs-cte';
import { fromPgVector, toPgVector } from '../pgvector-utils';
import { buildEdgeFilterClause } from '../sql-filter-builders';

type RawRow = {
  id: string;
  graph_id: string;
  source_id: string;
  target_id: string;
  name: string;
  fact: string;
  fact_embedding: string | null;
  attributes: unknown;
  episodes: string[] | null;
  valid_at: Date | null;
  invalid_at: Date | null;
  expired_at: Date | null;
  created_at: Date;
};

@Injectable()
export class EntityEdgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  @Span()
  async save(edge: EntityEdge): Promise<string> {
    await this.prisma.$executeRaw`
      INSERT INTO entity_edges (
        id, graph_id, source_id, target_id, name, fact,
        fact_embedding, attributes, episodes, valid_at, invalid_at, expired_at, created_at
      ) VALUES (
        ${edge.uuid}::uuid,
        ${edge.graphId}::uuid,
        ${edge.sourceNodeUuid}::uuid,
        ${edge.targetNodeUuid}::uuid,
        ${edge.name},
        ${edge.fact},
        ${toPgVector(edge.factEmbedding)}::vector,
        ${JSON.stringify(edge.attributes)}::jsonb,
        ${edge.episodes}::uuid[],
        ${edge.validAt},
        ${edge.invalidAt},
        ${edge.expiredAt},
        ${edge.createdAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        graph_id       = EXCLUDED.graph_id,
        source_id      = EXCLUDED.source_id,
        target_id      = EXCLUDED.target_id,
        name           = EXCLUDED.name,
        fact           = EXCLUDED.fact,
        fact_embedding = EXCLUDED.fact_embedding,
        attributes     = EXCLUDED.attributes,
        episodes       = EXCLUDED.episodes,
        valid_at       = EXCLUDED.valid_at,
        invalid_at     = EXCLUDED.invalid_at,
        expired_at     = EXCLUDED.expired_at
    `;
    return edge.uuid;
  }

  @Span()
  async saveBulk(edges: EntityEdge[]): Promise<void> {
    if (edges.length === 0) return;
    for (const edge of edges) {
      await this.save(edge);
    }
  }

  @Span()
  async delete(uuid: Uuid): Promise<void> {
    await this.prisma.entityEdge.delete({ where: { id: uuid } });
  }

  @Span()
  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.prisma.entityEdge.deleteMany({ where: { id: { in: uuids } } });
  }

  @Span()
  async getByUuid(uuid: Uuid): Promise<EntityEdge | null> {
    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id, graph_id, source_id, target_id, name, fact,
             fact_embedding::text AS fact_embedding, attributes, episodes,
             valid_at, invalid_at, expired_at, created_at
      FROM entity_edges
      WHERE id = ${uuid}::uuid
    `;
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  @Span()
  async getByUuids(uuids: Uuid[]): Promise<EntityEdge[]> {
    if (uuids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id, graph_id, source_id, target_id, name, fact,
             fact_embedding::text AS fact_embedding, attributes, episodes,
             valid_at, invalid_at, expired_at, created_at
      FROM entity_edges
      WHERE id = ANY(${uuids}::uuid[])
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getUuidsForEpisodeDeletion(episodeUuid: Uuid): Promise<Uuid[]> {
    // Only edges whose FIRST episode in the
    // ordered `episodes` array matches are considered. Edges that merely
    // accumulated this episode as a later contributor are intentionally kept.
    const rows = await this.prisma.$queryRaw<{ id: Uuid }[]>`
      SELECT id
      FROM entity_edges
      WHERE episodes[1] = ${episodeUuid}::uuid
    `;
    return rows.map((r) => r.id);
  }

  @Span()
  async getByGraphIds(params: GetByGraphIdsParams): Promise<EntityEdge[]> {
    const { graphIds, limit } = params;
    if (graphIds.length === 0) return [];
    const limitSql = limit !== undefined ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id, graph_id, source_id, target_id, name, fact,
             fact_embedding::text AS fact_embedding, attributes, episodes,
             valid_at, invalid_at, expired_at, created_at
      FROM entity_edges
      WHERE graph_id = ANY(${graphIds}::uuid[])
      ${limitSql}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getBetweenNodes(sourceUuid: Uuid, targetUuid: Uuid): Promise<EntityEdge[]> {
    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id, graph_id, source_id, target_id, name, fact,
             fact_embedding::text AS fact_embedding, attributes, episodes,
             valid_at, invalid_at, expired_at, created_at
      FROM entity_edges
      WHERE source_id = ${sourceUuid}::uuid AND target_id = ${targetUuid}::uuid
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getByNodeUuid(nodeUuid: Uuid): Promise<EntityEdge[]> {
    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id, graph_id, source_id, target_id, name, fact,
             fact_embedding::text AS fact_embedding, attributes, episodes,
             valid_at, invalid_at, expired_at, created_at
      FROM entity_edges
      WHERE source_id = ${nodeUuid}::uuid OR target_id = ${nodeUuid}::uuid
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async searchByFact(params: SearchByTextParams): Promise<EntityEdge[]> {
    const { query, graphIds, limit } = params;
    if (graphIds.length === 0) return [];
    const tsquery = Prisma.sql`plainto_tsquery('english', ${query})`;
    const rows = await this.prisma.$queryRaw<(RawRow & { score: number })[]>`
      SELECT e.id, e.graph_id, e.source_id, e.target_id, e.name, e.fact,
             e.fact_embedding::text AS fact_embedding, e.attributes, e.episodes,
             e.valid_at, e.invalid_at, e.expired_at, e.created_at,
             ts_rank(to_tsvector('english', e.name || ' ' || e.fact), ${tsquery}) AS score
      FROM entity_edges e
      WHERE e.graph_id = ANY(${graphIds}::uuid[])
        AND to_tsvector('english', e.name || ' ' || e.fact) @@ ${tsquery}
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async searchBySimilarity(
    params: SearchBySimilarityParams,
    filters?: SearchFilters,
  ): Promise<EntityEdge[]> {
    const { embedding, graphIds, limit, minScore } = params;
    if (graphIds.length === 0) return [];
    const vec = Prisma.sql`${toPgVector(embedding)}::vector`;
    const filterSql = buildEdgeFilterClause(filters, 'e');

    // See comment in ./entity-node.repository.ts
    const labelArray = Prisma.sql`ARRAY[${Prisma.join(
      graphIds.map((g) => Prisma.sql`graph_label_for(${g}::uuid)`),
    )}]::smallint[]`;

    const rows = await this.prisma.$queryRaw<(RawRow & { score: number })[]>`
      SELECT e.id, e.graph_id, e.source_id, e.target_id, e.name, e.fact,
             e.fact_embedding::text AS fact_embedding, e.attributes, e.episodes,
             e.valid_at, e.invalid_at, e.expired_at, e.created_at,
             1 - (e.fact_embedding <=> ${vec}) AS score
      FROM entity_edges e
      WHERE e.graph_label && ${labelArray}
        AND e.graph_id = ANY(${graphIds}::uuid[])
        AND e.fact_embedding IS NOT NULL
        AND 1 - (e.fact_embedding <=> ${vec}) >= ${minScore}
        ${filterSql}
      ORDER BY e.fact_embedding <=> ${vec}
      LIMIT ${limit}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async searchByBfs(
    params: SearchByBfsParams,
    filters?: SearchFilters,
  ): Promise<EntityEdge[]> {
    const { originNodeUuids, graphIds, limit, maxDepth } = params;
    if (originNodeUuids.length === 0) return [];
    const depth = maxDepth ?? MAX_SEARCH_DEPTH;
    const filterSql = buildEdgeFilterClause(filters, 'e');

    const cte = buildBfsCte(originNodeUuids, graphIds, depth);
    const rows = await this.prisma.$queryRaw<RawRow[]>`
      ${cte}
      SELECT DISTINCT e.id, e.graph_id, e.source_id, e.target_id, e.name, e.fact,
                      e.fact_embedding::text AS fact_embedding, e.attributes, e.episodes,
                      e.valid_at, e.invalid_at, e.expired_at, e.created_at
      FROM entity_edges e
      WHERE e.graph_id = ANY(${graphIds}::uuid[])
        AND e.source_id IN (SELECT id FROM bfs)
        AND e.target_id IN (SELECT id FROM bfs)
        ${filterSql}
      LIMIT ${limit}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async hasRelatesEdgesForGraph(graphId: Uuid): Promise<boolean> {
    const result = await this.prisma.entityEdge.findFirst({
      where: { graphId },
      select: { id: true },
    });
    return result !== null;
  }

  private mapRow(row: RawRow): EntityEdge {
    return {
      uuid: row.id as Uuid,
      graphId: row.graph_id as Uuid,
      sourceNodeUuid: row.source_id as Uuid,
      targetNodeUuid: row.target_id as Uuid,
      name: row.name as RelationshipType,
      fact: row.fact,
      factEmbedding: fromPgVector(row.fact_embedding),
      episodes: (row.episodes ?? []) as Uuid[],
      validAt: row.valid_at,
      invalidAt: row.invalid_at,
      expiredAt: row.expired_at,
      createdAt: row.created_at,
      attributes:
        row.attributes && typeof row.attributes === 'object'
          ? (row.attributes as Record<string, unknown>)
          : {},
    };
  }
}
