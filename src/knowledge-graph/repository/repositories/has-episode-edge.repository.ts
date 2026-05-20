import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { HasEpisodeEdge } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import { GetByGraphIdsWithCursorParams } from '../../types';

type Row = {
  uuid: string;
  graphId: string;
  sagaUuid: string;
  episodicUuid: string;
  createdAt: Date;
};

@Injectable()
export class HasEpisodeEdgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  @Span()
  async save(edge: HasEpisodeEdge): Promise<string> {
    await this.prisma.hasEpisodeEdge.upsert({
      where: { uuid: edge.uuid },
      create: {
        uuid: edge.uuid,
        graphId: edge.graphId,
        sagaUuid: edge.sourceNodeUuid,
        episodicUuid: edge.targetNodeUuid,
        createdAt: edge.createdAt,
      },
      update: {
        graphId: edge.graphId,
        sagaUuid: edge.sourceNodeUuid,
        episodicUuid: edge.targetNodeUuid,
      },
    });
    return edge.uuid;
  }

  @Span()
  async saveBulk(edges: HasEpisodeEdge[]): Promise<void> {
    if (edges.length === 0) return;
    for (const edge of edges) await this.save(edge);
  }

  @Span()
  async delete(uuid: Uuid): Promise<void> {
    await this.prisma.hasEpisodeEdge.delete({ where: { uuid } });
  }

  @Span()
  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.prisma.hasEpisodeEdge.deleteMany({ where: { uuid: { in: uuids } } });
  }

  @Span()
  async getByUuid(uuid: Uuid): Promise<HasEpisodeEdge | null> {
    const row = await this.prisma.hasEpisodeEdge.findUnique({ where: { uuid } });
    return row ? this.mapRow(row) : null;
  }

  @Span()
  async getByUuids(uuids: Uuid[]): Promise<HasEpisodeEdge[]> {
    if (uuids.length === 0) return [];
    const rows = await this.prisma.hasEpisodeEdge.findMany({
      where: { uuid: { in: uuids } },
    });
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getByGraphIds(params: GetByGraphIdsWithCursorParams): Promise<HasEpisodeEdge[]> {
    const { graphIds, limit, uuidCursor } = params;
    if (graphIds.length === 0) return [];
    const rows = await this.prisma.hasEpisodeEdge.findMany({
      where: {
        graphId: { in: graphIds },
        ...(uuidCursor ? { uuid: { lt: uuidCursor } } : {}),
      },
      orderBy: { uuid: 'desc' },
      ...(limit !== undefined ? { take: limit } : {}),
    });
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Row): HasEpisodeEdge {
    return {
      uuid: row.uuid as Uuid,
      graphId: row.graphId as Uuid,
      sourceNodeUuid: row.sagaUuid as Uuid,
      targetNodeUuid: row.episodicUuid as Uuid,
      createdAt: row.createdAt,
    };
  }
}
