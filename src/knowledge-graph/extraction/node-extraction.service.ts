import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Inject, Injectable } from '@nestjs/common';

import { LLM_TRACER, type LlmContext, type LlmTracer, Span } from '@/observability';

import { EntityTypeMap } from '../episode/types';
import { createEntityNode, EntityNode, EpisodicNode } from '../models';
import { NodeLabel, NodeLabels, NodeLabelSchema } from '../neo4j';
import { buildExtractNodesMessages } from '../prompts';
import { extractedEntitiesJsonSchema } from './types';

type SpanMetrics = Record<string, string | number | boolean | undefined>;
const metricsOnResult = (r: unknown) => ({
  attributes: (r as { metrics: SpanMetrics }).metrics,
});

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
          groupId: episode.groupId,
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
        'episode.uuid': episode.uuid,
        'entityTypes.count': entityTypes ? Object.keys(entityTypes).length : 0,
        'nodes.extracted.count': nodes.length,
      },
    };
  }
}
