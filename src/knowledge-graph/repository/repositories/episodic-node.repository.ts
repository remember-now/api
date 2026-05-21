import { Injectable } from '@nestjs/common';

import { Prisma, EpisodicNode as PrismaEpisodicNode } from '@generated/prisma/client';

import { Uuid } from '@/common/schemas';
import { EpisodicNode } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import {
  EpisodeType,
  GetByGraphIdsParams,
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
      where: { id: node.uuid },
      create: {
        id: node.uuid,
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
    return node.uuid;
  }

  @Span()
  async saveBulk(nodes: EpisodicNode[]): Promise<void> {
    if (nodes.length === 0) return;
    for (const node of nodes) await this.save(node);
  }

  @Span()
  async delete(uuid: Uuid): Promise<void> {
    await this.prisma.episodicNode.delete({ where: { id: uuid } });
  }

  @Span()
  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.prisma.episodicNode.deleteMany({ where: { id: { in: uuids } } });
  }

  @Span()
  async deleteByGraphId(graphId: Uuid): Promise<void> {
    await this.prisma.episodicNode.deleteMany({ where: { graphId } });
  }

  @Span()
  async getByUuid(uuid: Uuid): Promise<EpisodicNode | null> {
    const row = await this.prisma.episodicNode.findUnique({ where: { id: uuid } });
    return row ? this.mapRow(row) : null;
  }

  @Span()
  async getByUuids(uuids: Uuid[]): Promise<EpisodicNode[]> {
    if (uuids.length === 0) return [];
    const rows = await this.prisma.episodicNode.findMany({
      where: { id: { in: uuids } },
    });
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getByGraphIds(params: GetByGraphIdsParams): Promise<EpisodicNode[]> {
    const { graphIds, limit } = params;
    if (graphIds.length === 0) return [];
    const rows = await this.prisma.episodicNode.findMany({
      where: { graphId: { in: graphIds } },
      ...(limit !== undefined ? { take: limit } : {}),
    });
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async retrieveEpisodes(params: RetrieveEpisodesParams): Promise<EpisodicNode[]> {
    const { referenceTime, graphIds, source, sagaUuid, lastN } = params;
    const rows = await this.prisma.episodicNode.findMany({
      where: {
        validAt: { lte: referenceTime },
        graphId: { in: graphIds },
        ...(source ? { source } : {}),
        ...(sagaUuid ? { hasEpisodeEdges: { some: { sagaId: sagaUuid } } } : {}),
      },
      orderBy: [{ validAt: 'desc' }, { createdAt: 'desc' }],
      take: lastN,
    });
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getMentionedEntityUuids(episodeUuid: Uuid): Promise<Uuid[]> {
    const rows = await this.prisma.episodicEdge.findMany({
      where: { episodicId: episodeUuid },
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
      uuid: row.id as Uuid,
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
