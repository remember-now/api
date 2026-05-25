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

import { EdgeTypeMap, EdgeTypeMappings, EntityTypeMap } from '../episode/types';
import {
  createEntityEdge,
  createEntityNode,
  EntityEdge,
  EntityNode,
  EpisodicNode,
} from '../models';
import {
  buildExtractNodesAndEdgesMessages,
  buildExtractTimestampsBatchMessages,
  combinedExtractionJsonSchema,
  timestampsBatchJsonSchema,
} from '../prompts';
import { NodeLabel, NodeLabels, NodeLabelSchema } from '../types';

type CombinedExtractionResult = {
  nodes: EntityNode[];
  edges: EntityEdge[];
  nodeEpisodeIndexMap: Map<string, number[]>;
};

@Injectable()
export class CombinedExtractionService {
  constructor(@Inject(LLM_TRACER) private readonly llmTracer: LlmTracer) {}

  async extractNodesAndEdges(
    model: BaseChatModel,
    episodes: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    edgeTypes?: EdgeTypeMap,
    edgeTypeMappings?: EdgeTypeMappings,
    customInstructions?: string,
    excludedEntityTypes?: string[],
    ctx?: LlmContext,
  ): Promise<CombinedExtractionResult> {
    const { metrics: _m, ...rest } = await this.extractNodesAndEdgesImpl(
      model,
      episodes,
      entityTypes,
      edgeTypes,
      edgeTypeMappings,
      customInstructions,
      excludedEntityTypes,
      ctx,
    );
    return rest;
  }

  @Span('combinedExtraction', { onResult: metricsOnResult })
  private async extractNodesAndEdgesImpl(
    model: BaseChatModel,
    episodes: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    edgeTypes?: EdgeTypeMap,
    edgeTypeMappings?: EdgeTypeMappings,
    customInstructions?: string,
    excludedEntityTypes?: string[],
    ctx?: LlmContext,
  ): Promise<CombinedExtractionResult & { metrics: SpanMetrics }> {
    const baseMetrics: SpanMetrics = {
      'episodes.count': episodes.length,
      'entityTypes.count': entityTypes ? Object.keys(entityTypes).length : 0,
      'edgeTypes.count': edgeTypes ? Object.keys(edgeTypes).length : 0,
    };

    if (episodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        nodeEpisodeIndexMap: new Map(),
        metrics: {
          ...baseMetrics,
          'nodes.extracted.count': 0,
          'edges.extracted.count': 0,
        },
      };
    }

    const referenceTime = episodes.reduce(
      (latest, ep) => (ep.validAt > latest ? ep.validAt : latest),
      episodes[0].validAt,
    );

    // 1. Single combined LLM call to extract both entities and facts
    const messages = buildExtractNodesAndEdgesMessages({
      episodes,
      referenceTime,
      entityTypes,
      edgeTypes,
      edgeTypeMappings,
      customInstructions,
    });

    const result = await model
      .withStructuredOutput(combinedExtractionJsonSchema)
      .invoke(messages, {
        callbacks: this.llmTracer.getCallbacks(ctx),
        runName: 'extract-nodes-and-edges',
        tags: ['knowledge-graph', 'extraction.combined'],
      });

    // 2. Collect referenced entity names from facts (case-insensitive)
    const referencedNames = new Set<string>();
    for (const fact of result.facts) {
      referencedNames.add(fact.sourceEntityName.toLowerCase());
      referencedNames.add(fact.targetEntityName.toLowerCase());
    }

    // 3. Build EntityNode[] - only entities that appear in at least one fact
    const nameToNode = new Map<string, EntityNode>();
    for (const entity of result.entities) {
      const nameLower = entity.name.toLowerCase();
      if (!entity.name.trim() || !referencedNames.has(nameLower)) continue;

      // Apply excluded entity types filter
      const labels = resolveLabels(entity.entityTypeId, entityTypes);
      if (excludedEntityTypes?.length) {
        const specificLabel = labels.find((l) => l !== 'Entity') ?? 'Entity';
        if (excludedEntityTypes.includes(specificLabel)) continue;
      }

      // First occurrence wins for duplicate names (case-insensitive)
      if (!nameToNode.has(nameLower)) {
        nameToNode.set(
          nameLower,
          createEntityNode({
            name: entity.name,
            graphId: episodes[0].graphId,
            labels,
          }),
        );
      }
    }

    // 4. Batch-extract timestamps for facts that have no temporal info
    const factsNeedingTimestamps = result.facts
      .map((f, i) => ({ fact: f, idx: i }))
      .filter((x) => x.fact.validAt === undefined || x.fact.validAt === null);

    const timestampMap = new Map<
      number,
      { validAt?: string | null; invalidAt?: string | null }
    >();
    if (factsNeedingTimestamps.length > 0) {
      const tsMessages = buildExtractTimestampsBatchMessages({
        facts: factsNeedingTimestamps.map((x) => x.fact.fact),
        referenceTime,
      });
      const tsResult = await model
        .withStructuredOutput(timestampsBatchJsonSchema)
        .invoke(tsMessages, {
          callbacks: this.llmTracer.getCallbacks(ctx),
          runName: 'extract-timestamps-batch',
          tags: ['knowledge-graph', 'extraction.timestamps'],
        });
      for (let i = 0; i < factsNeedingTimestamps.length; i++) {
        const original = factsNeedingTimestamps[i];
        const ts = tsResult.facts[i];
        if (ts) timestampMap.set(original.idx, ts);
      }
    }

    // 5. Build EntityEdge[] and derive nodeEpisodeIndexMap from episodeIndices
    const nodeEpisodeIndexMap = new Map<string, number[]>();
    const edges: EntityEdge[] = [];
    const maxEpIdx = episodes.length - 1;

    for (let i = 0; i < result.facts.length; i++) {
      const f = result.facts[i];
      const srcNode = nameToNode.get(f.sourceEntityName.toLowerCase());
      const tgtNode = nameToNode.get(f.targetEntityName.toLowerCase());
      if (!srcNode || !tgtNode) continue;

      // Clamp episode indices to valid range
      const rawIndices = (f.episodeIndices ?? []).filter(
        (idx) => idx >= 0 && idx <= maxEpIdx,
      );
      const epIndices =
        rawIndices.length > 0
          ? rawIndices
          : Array.from({ length: episodes.length }, (_, k) => k);

      // Accumulate node episode attribution
      for (const [nodeName, node] of [
        [f.sourceEntityName.toLowerCase(), srcNode],
        [f.targetEntityName.toLowerCase(), tgtNode],
      ] as [string, EntityNode][]) {
        void nodeName;
        const existing = nodeEpisodeIndexMap.get(node.id) ?? [];
        for (const idx of epIndices) {
          if (!existing.includes(idx)) existing.push(idx);
        }
        nodeEpisodeIndexMap.set(node.id, existing);
      }

      const episodeIds = epIndices.map((idx) => episodes[idx].id);

      const tsOverride = timestampMap.get(i);
      const rawValidAt = tsOverride?.validAt ?? f.validAt;
      const rawInvalidAt = tsOverride?.invalidAt ?? f.invalidAt;

      edges.push(
        createEntityEdge({
          name: f.relationType,
          fact: f.fact,
          graphId: episodes[0].graphId,
          sourceNodeId: srcNode.id,
          targetNodeId: tgtNode.id,
          episodes: episodeIds,
          validAt: typeof rawValidAt === 'string' ? new Date(rawValidAt) : null,
          invalidAt: typeof rawInvalidAt === 'string' ? new Date(rawInvalidAt) : null,
        }),
      );
    }

    const nodes = [...nameToNode.values()];

    return {
      nodes,
      edges,
      nodeEpisodeIndexMap,
      metrics: {
        ...baseMetrics,
        'nodes.extracted.count': nodes.length,
        'edges.extracted.count': edges.length,
      },
    };
  }
}

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
