import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { EpisodicEdge } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import { GetByGraphIdsWithCursorParams } from '../../types';

type Row = {
  id: string;
  graphId: string;
  episodicId: string;
  entityId: string;
  createdAt: Date;
};

@Injectable()
export class EpisodicEdgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  @Span()
  async save(edge: EpisodicEdge): Promise<string> {
    await this.prisma.episodicEdge.upsert({
      where: { id: edge.uuid },
      create: {
        id: edge.uuid,
        graphId: edge.graphId,
        episodicId: edge.sourceNodeUuid,
        entityId: edge.targetNodeUuid,
        createdAt: edge.createdAt,
      },
      update: {
        graphId: edge.graphId,
        episodicId: edge.sourceNodeUuid,
        entityId: edge.targetNodeUuid,
      },
    });
    return edge.uuid;
  }

  @Span()
  async saveBulk(edges: EpisodicEdge[]): Promise<void> {
    if (edges.length === 0) return;
    for (const edge of edges) await this.save(edge);
  }

  @Span()
  async delete(uuid: Uuid): Promise<void> {
    await this.prisma.episodicEdge.delete({ where: { id: uuid } });
  }

  @Span()
  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.prisma.episodicEdge.deleteMany({ where: { id: { in: uuids } } });
  }

  @Span()
  async deleteBySourceUuid(episodeUuid: Uuid): Promise<void> {
    await this.prisma.episodicEdge.deleteMany({ where: { episodicId: episodeUuid } });
  }

  @Span()
  async getByUuid(uuid: Uuid): Promise<EpisodicEdge | null> {
    const row = await this.prisma.episodicEdge.findUnique({ where: { id: uuid } });
    return row ? this.mapRow(row) : null;
  }

  @Span()
  async getByUuids(uuids: Uuid[]): Promise<EpisodicEdge[]> {
    if (uuids.length === 0) return [];
    const rows = await this.prisma.episodicEdge.findMany({
      where: { id: { in: uuids } },
    });
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getByGraphIds(params: GetByGraphIdsWithCursorParams): Promise<EpisodicEdge[]> {
    const { graphIds, limit, uuidCursor } = params;
    if (graphIds.length === 0) return [];
    const rows = await this.prisma.episodicEdge.findMany({
      where: {
        graphId: { in: graphIds },
        ...(uuidCursor ? { id: { lt: uuidCursor } } : {}),
      },
      orderBy: { id: 'desc' },
      ...(limit !== undefined ? { take: limit } : {}),
    });
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Row): EpisodicEdge {
    return {
      uuid: row.id as Uuid,
      graphId: row.graphId as Uuid,
      sourceNodeUuid: row.episodicId as Uuid,
      targetNodeUuid: row.entityId as Uuid,
      createdAt: row.createdAt,
    };
  }
}
