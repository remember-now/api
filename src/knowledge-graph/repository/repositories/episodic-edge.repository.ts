import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { EpisodicEdge } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

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
  async deleteBySourceUuid(episodeUuid: Uuid): Promise<void> {
    await this.prisma.episodicEdge.deleteMany({ where: { episodicId: episodeUuid } });
  }
}
