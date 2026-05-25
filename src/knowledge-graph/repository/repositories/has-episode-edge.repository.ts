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
      where: { id: edge.id },
      create: {
        id: edge.id,
        graphId: edge.graphId,
        sagaId: edge.sourceNodeId,
        episodicId: edge.targetNodeId,
        createdAt: edge.createdAt,
      },
      update: {
        graphId: edge.graphId,
        sagaId: edge.sourceNodeId,
        episodicId: edge.targetNodeId,
      },
    });
    return edge.id;
  }
}
