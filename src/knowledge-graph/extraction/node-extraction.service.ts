import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Inject, Injectable } from '@nestjs/common';

import {
  LLM_TRACER,
  type LlmContext,
  type LlmTracer,
  metricsOnResult,
  Span,
  type SpanMetrics,
} from '@/observability';

import { EntityTypeMap } from '../episode/types';
import { createEntityNode, EntityNode, EpisodicNode } from '../models';
import { buildExtractNodesMessages, extractedEntitiesJsonSchema } from '../prompts';
import { NodeLabel, NodeLabels, NodeLabelSchema } from '../types';

function resolveLabels(
  entityTypeId: number | undefined,
  entityTypes?: EntityTypeMap,
): NodeLabels {
  const entity = NodeLabelSchema.parse('Entity');

  if (entityTypeId === undefined || !entityTypes) {
    return [entity];
  }
  const labels = Object.keys(entityTypes) as NodeLabel[];
  const label = labels[entityTypeId];
  return label ? [entity, label] : [entity];
}

@Injectable()
export class NodeExtractionService {
  constructor(@Inject(LLM_TRACER) private readonly llmTracer: LlmTracer) {}

  async extractNodes(
    model: BaseChatModel,
    episode: EpisodicNode,
    previousEpisodes: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    customInstructions?: string,
    excludedEntityTypes?: string[],
    ctx?: LlmContext,
  ): Promise<EntityNode[]> {
    const { nodes } = await this.extractNodesImpl(
      model,
      episode,
      previousEpisodes,
      entityTypes,
      customInstructions,
      excludedEntityTypes,
      ctx,
    );
    return nodes;
  }

  @Span('nodeExtraction', { onResult: metricsOnResult })
  private async extractNodesImpl(
    model: BaseChatModel,
    episode: EpisodicNode,
    previousEpisodes: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    customInstructions?: string,
    excludedEntityTypes?: string[],
    ctx?: LlmContext,
  ): Promise<{ nodes: EntityNode[]; metrics: SpanMetrics }> {
    const messages = buildExtractNodesMessages({
      episode,
      previousEpisodes,
      entityTypes,
      customInstructions,
    });

    const result = await model
      .withStructuredOutput(extractedEntitiesJsonSchema)
      .invoke(messages, {
        callbacks: this.llmTracer.getCallbacks(ctx),
        runName: 'extract-nodes',
        tags: ['knowledge-graph', 'extraction.node'],
      });

    const nodes = result.extractedEntities
      .filter((e) => e.name.trim() !== '')
      .map((e) =>
        createEntityNode({
          name: e.name,
          graphId: episode.graphId,
          labels: resolveLabels(e.entityTypeId, entityTypes),
        }),
      )
      .filter((node) => {
        if (!excludedEntityTypes?.length) return true;
        const specificLabel = node.labels.find((l) => l !== 'Entity') ?? 'Entity';
        return !excludedEntityTypes.includes(specificLabel);
      });

    return {
      nodes,
      metrics: {
        'episode.id': episode.id,
        'entityTypes.count': entityTypes ? Object.keys(entityTypes).length : 0,
        'nodes.extracted.count': nodes.length,
      },
    };
  }
}
