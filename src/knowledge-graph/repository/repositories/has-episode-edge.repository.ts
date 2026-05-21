import { Injectable } from '@nestjs/common';

import { HasEpisodeEdge } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

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
}
