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

import { EdgeTypeMap, EdgeTypeMappings } from '../episode/types';
import { createEntityEdge, EntityEdge, EntityNode, EpisodicNode } from '../models';
import { buildExtractEdgesMessages, extractedEdgesJsonSchema } from '../prompts';

@Injectable()
export class EdgeExtractionService {
  constructor(@Inject(LLM_TRACER) private readonly llmTracer: LlmTracer) {}

  async extractEdges(
    model: BaseChatModel,
    episode: EpisodicNode,
    nodes: EntityNode[],
    previousEpisodes: EpisodicNode[],
    referenceTime: Date,
    customInstructions?: string,
    edgeTypes?: EdgeTypeMap,
    edgeTypeMappings?: EdgeTypeMappings,
    ctx?: LlmContext,
  ): Promise<EntityEdge[]> {
    const { edges } = await this.extractEdgesImpl(
      model,
      episode,
      nodes,
      previousEpisodes,
      referenceTime,
      customInstructions,
      edgeTypes,
      edgeTypeMappings,
      ctx,
    );
    return edges;
  }

  @Span('edgeExtraction', { onResult: metricsOnResult })
  private async extractEdgesImpl(
    model: BaseChatModel,
    episode: EpisodicNode,
    nodes: EntityNode[],
    previousEpisodes: EpisodicNode[],
    referenceTime: Date,
    customInstructions?: string,
    edgeTypes?: EdgeTypeMap,
    edgeTypeMappings?: EdgeTypeMappings,
    ctx?: LlmContext,
  ): Promise<{ edges: EntityEdge[]; metrics: SpanMetrics }> {
    const nameToNode = new Map<string, EntityNode>(
      nodes.map((n) => [n.name.toLowerCase(), n]),
    );

    const messages = buildExtractEdgesMessages({
      episode,
      nodes,
      previousEpisodes,
      referenceTime,
      customInstructions,
      edgeTypes,
      edgeTypeMappings,
    });

    const result = await model
      .withStructuredOutput(extractedEdgesJsonSchema)
      .invoke(messages, {
        callbacks: this.llmTracer.getCallbacks(ctx),
        runName: 'extract-edges',
        tags: ['knowledge-graph', 'extraction.edge'],
      });

    const edges = result.edges
      .filter((e) => {
        const hasSource = nameToNode.has(e.sourceEntityName.toLowerCase());
        const hasTarget = nameToNode.has(e.targetEntityName.toLowerCase());
        return hasSource && hasTarget;
      })
      .map((e) => {
        const sourceNode = nameToNode.get(e.sourceEntityName.toLowerCase())!;
        const targetNode = nameToNode.get(e.targetEntityName.toLowerCase())!;
        return createEntityEdge({
          name: e.relationType,
          fact: e.fact,
          graphId: episode.graphId,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          episodes: [episode.id],
          validAt: typeof e.validAt === 'string' ? new Date(e.validAt) : null,
          invalidAt: typeof e.invalidAt === 'string' ? new Date(e.invalidAt) : null,
        });
      });

    return {
      edges,
      metrics: {
        'episode.id': episode.id,
        'nodes.input.count': nodes.length,
        'edgeTypes.count': edgeTypes ? Object.keys(edgeTypes).length : 0,
        'edges.llm_returned.count': result.edges.length,
        'edges.dropped.count': result.edges.length - edges.length,
        'edges.extracted.count': edges.length,
      },
    };
  }
}
