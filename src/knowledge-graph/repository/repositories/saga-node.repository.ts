import { Injectable } from '@nestjs/common';

import { SagaNode as PrismaSagaNode } from '@generated/prisma/client';

import { Uuid } from '@/common/schemas';
import { SagaNode } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import { NodeLabels, NodeName } from '../../types';

@Injectable()
export class SagaNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  @Span()
  async save(node: SagaNode): Promise<string> {
    await this.prisma.sagaNode.upsert({
      where: { id: node.uuid },
      create: {
        id: node.uuid,
        graphId: node.graphId,
        name: node.name,
        labels: node.labels,
        summary: node.summary,
        lastSummarizedAt: node.lastSummarizedAt,
        createdAt: node.createdAt,
      },
      update: {
        graphId: node.graphId,
        name: node.name,
        labels: node.labels,
        summary: node.summary,
        lastSummarizedAt: node.lastSummarizedAt,
      },
    });
    return node.uuid;
  }

  @Span()
  async createIfNotExists(node: SagaNode): Promise<void> {
    await this.prisma.sagaNode.createMany({
      data: {
        id: node.uuid,
        graphId: node.graphId,
        name: node.name,
        labels: node.labels,
        summary: node.summary,
        lastSummarizedAt: node.lastSummarizedAt,
        createdAt: node.createdAt,
      },
      skipDuplicates: true,
    });
  }

  @Span()
  async getByUuid(uuid: Uuid): Promise<SagaNode | null> {
    const row = await this.prisma.sagaNode.findUnique({ where: { id: uuid } });
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: PrismaSagaNode): SagaNode {
    return {
      uuid: row.id as Uuid,
      graphId: row.graphId as Uuid,
      name: row.name as NodeName,
      labels: (row.labels ?? []) as NodeLabels,
      summary: row.summary ?? '',
      lastSummarizedAt: row.lastSummarizedAt,
      createdAt: row.createdAt,
    };
  }
}
