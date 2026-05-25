import { Injectable } from '@nestjs/common';

import { Prisma, EpisodicNode as PrismaEpisodicNode } from '@generated/prisma/client';

import { Uuid } from '@/common/schemas';
import { EpisodicNode } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import {
  EpisodeType,
  NodeLabels,
  NodeName,
  RetrieveEpisodesParams,
  SearchByTextParams,
} from '../../types';

type Row = Pick<
  PrismaEpisodicNode,
  | 'id'
  | 'graphId'
  | 'name'
  | 'labels'
  | 'source'
  | 'sourceDescription'
  | 'content'
  | 'validAt'
  | 'createdAt'
>;

@Injectable()
export class EpisodicNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  @Span()
  async save(node: EpisodicNode): Promise<string> {
    await this.prisma.episodicNode.upsert({
      where: { id: node.id },
      create: {
        id: node.id,
        graphId: node.graphId,
        name: node.name,
        labels: node.labels,
        source: node.source,
        sourceDescription: node.sourceDescription,
        content: node.content,
        validAt: node.validAt,
        createdAt: node.createdAt,
      },
      update: {
        graphId: node.graphId,
        name: node.name,
        labels: node.labels,
        source: node.source,
        sourceDescription: node.sourceDescription,
        content: node.content,
        validAt: node.validAt,
      },
    });
    return node.id;
  }

  @Span()
  async saveBulk(nodes: EpisodicNode[]): Promise<void> {
    if (nodes.length === 0) return;
    for (const node of nodes) await this.save(node);
  }

  @Span()
  async delete(id: Uuid): Promise<void> {
    await this.prisma.episodicNode.delete({ where: { id: id } });
  }

  @Span()
  async getById(id: Uuid): Promise<EpisodicNode | null> {
    const row = await this.prisma.episodicNode.findUnique({ where: { id: id } });
    return row ? this.mapRow(row) : null;
  }

  @Span()
  async retrieveEpisodes(params: RetrieveEpisodesParams): Promise<EpisodicNode[]> {
    const { referenceTime, graphIds, source, sagaId, lastN } = params;
    const rows = await this.prisma.episodicNode.findMany({
      where: {
        validAt: { lte: referenceTime },
        graphId: { in: graphIds },
        ...(source ? { source } : {}),
        ...(sagaId ? { hasEpisodeEdges: { some: { sagaId: sagaId } } } : {}),
      },
      orderBy: [{ validAt: 'desc' }, { createdAt: 'desc' }],
      take: lastN,
    });
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getMentionedEntityIds(episodeId: Uuid): Promise<Uuid[]> {
    const rows = await this.prisma.episodicEdge.findMany({
      where: { episodicId: episodeId },
      select: { entityId: true },
    });
    return rows.map((r) => r.entityId as Uuid);
  }

  @Span()
  async searchByContent(params: SearchByTextParams): Promise<EpisodicNode[]> {
    const { query, graphIds, limit } = params;
    if (graphIds.length === 0) return [];
    const tsquery = Prisma.sql`plainto_tsquery('english', ${query})`;
    const rows = await this.prisma.$queryRaw<(Row & { score: number })[]>`
      SELECT en.id,
             en.graph_id           AS "graphId",
             en.name,
             en.labels,
             en.source,
             en.source_description AS "sourceDescription",
             en.content,
             en.valid_at           AS "validAt",
             en.created_at         AS "createdAt",
             ts_rank(to_tsvector('english', en.content), ${tsquery}) AS score
      FROM episodic_nodes en
      WHERE en.graph_id = ANY(${graphIds}::uuid[])
        AND to_tsvector('english', en.content) @@ ${tsquery}
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Row): EpisodicNode {
    return {
      id: row.id as Uuid,
      name: row.name as NodeName,
      graphId: row.graphId as Uuid,
      labels: (row.labels ?? []) as NodeLabels,
      createdAt: row.createdAt,
      source: (row.source as EpisodeType) ?? EpisodeType.text,
      sourceDescription: row.sourceDescription ?? '',
      content: row.content ?? '',
      validAt: row.validAt,
    };
  }
}
