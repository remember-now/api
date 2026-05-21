import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { HasEpisodeEdge } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import { GetByGraphIdsWithCursorParams } from '../../types';

type Row = {
  id: string;
  graphId: string;
  sagaId: string;
  episodicId: string;
  createdAt: Date;
};

@Injectable()
export class HasEpisodeEdgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  @Span()
  async save(edge: HasEpisodeEdge): Promise<string> {
    await this.prisma.hasEpisodeEdge.upsert({
      where: { id: edge.uuid },
      create: {
        id: edge.uuid,
        graphId: edge.graphId,
        sagaId: edge.sourceNodeUuid,
        episodicId: edge.targetNodeUuid,
        createdAt: edge.createdAt,
      },
      update: {
        graphId: edge.graphId,
        sagaId: edge.sourceNodeUuid,
        episodicId: edge.targetNodeUuid,
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
    await this.prisma.hasEpisodeEdge.delete({ where: { id: uuid } });
  }

  @Span()
  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.prisma.hasEpisodeEdge.deleteMany({ where: { id: { in: uuids } } });
  }

  @Span()
  async getByUuid(uuid: Uuid): Promise<HasEpisodeEdge | null> {
    const row = await this.prisma.hasEpisodeEdge.findUnique({ where: { id: uuid } });
    return row ? this.mapRow(row) : null;
  }

  @Span()
  async getByUuids(uuids: Uuid[]): Promise<HasEpisodeEdge[]> {
    if (uuids.length === 0) return [];
    const rows = await this.prisma.hasEpisodeEdge.findMany({
      where: { id: { in: uuids } },
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
        ...(uuidCursor ? { id: { lt: uuidCursor } } : {}),
      },
      orderBy: { id: 'desc' },
      ...(limit !== undefined ? { take: limit } : {}),
    });
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Row): HasEpisodeEdge {
    return {
      uuid: row.id as Uuid,
      graphId: row.graphId as Uuid,
      sourceNodeUuid: row.sagaId as Uuid,
      targetNodeUuid: row.episodicId as Uuid,
      createdAt: row.createdAt,
    };
  }
}
