import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { SagaNode } from '@/knowledge-graph/models';
import { Span } from '@/observability';
import { PrismaService } from '@/providers/database/postgres/prisma.service';

import { GetByGraphIdsWithCursorParams, NodeLabels, NodeName } from '../../types';

type Row = {
  id: string;
  graphId: string;
  name: string;
  labels: string[];
  summary: string;
  lastSummarizedAt: Date | null;
  createdAt: Date;
};

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
  async saveBulk(nodes: SagaNode[]): Promise<void> {
    if (nodes.length === 0) return;
    for (const node of nodes) await this.save(node);
  }

  @Span()
  async delete(uuid: Uuid): Promise<void> {
    await this.prisma.sagaNode.delete({ where: { id: uuid } });
  }

  @Span()
  async deleteByUuids(uuids: Uuid[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.prisma.sagaNode.deleteMany({ where: { id: { in: uuids } } });
  }

  @Span()
  async deleteByGraphId(graphId: Uuid): Promise<void> {
    await this.prisma.sagaNode.deleteMany({ where: { graphId } });
  }

  @Span()
  async getByUuid(uuid: Uuid): Promise<SagaNode | null> {
    const row = await this.prisma.sagaNode.findUnique({ where: { id: uuid } });
    return row ? this.mapRow(row) : null;
  }

  @Span()
  async getByUuids(uuids: Uuid[]): Promise<SagaNode[]> {
    if (uuids.length === 0) return [];
    const rows = await this.prisma.sagaNode.findMany({ where: { id: { in: uuids } } });
    return rows.map((r) => this.mapRow(r));
  }

  @Span()
  async getByGraphIds(params: GetByGraphIdsWithCursorParams): Promise<SagaNode[]> {
    const { graphIds, limit, uuidCursor } = params;
    if (graphIds.length === 0) return [];
    const rows = await this.prisma.sagaNode.findMany({
      where: {
        graphId: { in: graphIds },
        ...(uuidCursor ? { id: { lt: uuidCursor } } : {}),
      },
      orderBy: { id: 'desc' },
      ...(limit !== undefined ? { take: limit } : {}),
    });
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Row): SagaNode {
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
