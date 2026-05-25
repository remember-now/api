import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Inject, Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import {
  LLM_TRACER,
  type LlmContext,
  type LlmTracer,
  metricsOnResult,
  Span,
  type SpanMetrics,
} from '@/observability';

import { EntityNode, EpisodicNode } from '../models';
import { buildDedupeNodesMessages } from '../prompts';
import {
  COSINE_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  LOW_ENTROPY_THRESHOLD,
  MAX_CANDIDATES,
  normalizeNameForEntropy,
  normalizeString,
  shannonEntropy,
} from './resolution-utils';
import { NodeResolutionResult, nodeResolutionsJsonSchema } from './types';

@Injectable()
export class NodeResolutionService {
  constructor(@Inject(LLM_TRACER) private readonly llmTracer: LlmTracer) {}

  async resolveNodes(
    model: BaseChatModel,
    episode: EpisodicNode,
    extractedNodes: EntityNode[],
    existingNodes: EntityNode[],
    previousEpisodes: EpisodicNode[] = [],
    customInstructions?: string,
    ctx?: LlmContext,
  ): Promise<NodeResolutionResult> {
    const { metrics: _m, ...rest } = await this.resolveNodesImpl(
      model,
      episode,
      extractedNodes,
      existingNodes,
      previousEpisodes,
      customInstructions,
      ctx,
    );
    return rest;
  }

  @Span('nodeResolution', { onResult: metricsOnResult })
  private async resolveNodesImpl(
    model: BaseChatModel,
    episode: EpisodicNode,
    extractedNodes: EntityNode[],
    existingNodes: EntityNode[],
    previousEpisodes: EpisodicNode[] = [],
    customInstructions?: string,
    ctx?: LlmContext,
  ): Promise<NodeResolutionResult & { metrics: SpanMetrics }> {
    const idMap = new Map<Uuid, Uuid>();
    const duplicatePairs: Array<{
      extractedId: Uuid;
      canonicalId: Uuid;
    }> = [];
    const llmCandidates = new Map<Uuid, EntityNode[]>();

    for (const extracted of extractedNodes) {
      const normalizedName = normalizeString(extracted.name);

      // Exact match check
      const exactMatch = existingNodes.find(
        (n) => normalizeString(n.name) === normalizedName,
      );
      if (exactMatch) {
        idMap.set(extracted.id, exactMatch.id);
        duplicatePairs.push({
          extractedId: extracted.id,
          canonicalId: exactMatch.id,
        });
        continue;
      }

      // Low entropy → skip cosine, go to LLM with all existing as candidates.
      // Mirrors Python: _normalize_name_for_fuzzy strips to [a-z0-9' ] (no spaces)
      // and _name_entropy computes entropy over that form.
      if (
        shannonEntropy(normalizeNameForEntropy(normalizedName)) < LOW_ENTROPY_THRESHOLD &&
        existingNodes.length > 0
      ) {
        llmCandidates.set(extracted.id, existingNodes);
        continue;
      }

      // Cosine similarity scan
      const embeddingCandidates = existingNodes.filter((n) => n.nameEmbedding !== null);

      if (extracted.nameEmbedding !== null && embeddingCandidates.length > 0) {
        const scored = embeddingCandidates
          .map((n) => ({
            node: n,
            score: cosineSimilarity(extracted.nameEmbedding!, n.nameEmbedding!),
          }))
          .filter((s) => s.score >= COSINE_SIMILARITY_THRESHOLD)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_CANDIDATES);

        if (scored.length >= 1) {
          llmCandidates.set(
            extracted.id,
            scored.map((s) => s.node),
          );
          continue;
        }
        // 0 matches → new node, falls through
      }
    }

    // Batch LLM call for all ambiguous nodes
    if (llmCandidates.size > 0) {
      const llmExtractedWithIdx = extractedNodes
        .filter((n) => llmCandidates.has(n.id))
        .map((n, idx) => ({ id: idx, name: n.name, entityId: n.id }));

      const idxToEntityId = new Map(llmExtractedWithIdx.map((e) => [e.id, e.entityId]));

      // Collect unique candidate nodes across all batches, assigning a stable
      // integer candidate_id so the LLM can reference them unambiguously.
      // String-name references are hallucination-prone; integer ids cannot be
      // invented (the LLM either picks one we sent or -1 for "no match").
      const candidateSet = new Map<Uuid, EntityNode>();
      for (const candidates of llmCandidates.values()) {
        for (const c of candidates) {
          candidateSet.set(c.id, c);
        }
      }
      const candidatesList = Array.from(candidateSet.values());
      const candidateIdToEntity = new Map<number, EntityNode>(
        candidatesList.map((n, idx) => [idx, n]),
      );
      const allCandidates = candidatesList.map((n, idx) => ({
        candidateId: idx,
        name: n.name,
      }));

      const messages = buildDedupeNodesMessages({
        episode,
        previousEpisodes,
        extractedNodes: llmExtractedWithIdx.map(({ id, name }) => ({
          id,
          name,
        })),
        candidateNodes: allCandidates,
        customInstructions,
      });

      const raw = await model
        .withStructuredOutput(nodeResolutionsJsonSchema)
        .invoke(messages, {
          callbacks: this.llmTracer.getCallbacks(ctx),
          runName: 'resolve-nodes',
          tags: ['knowledge-graph', 'resolution.node'],
        });

      const resolutions = raw.entity_resolutions;

      for (const resolution of resolutions) {
        const extractedId = idxToEntityId.get(resolution.id);
        if (!extractedId) continue;

        if (resolution.duplicate_candidate_id >= 0) {
          const canonical = candidateIdToEntity.get(resolution.duplicate_candidate_id);
          if (canonical) {
            idMap.set(extractedId, canonical.id);
            duplicatePairs.push({
              extractedId,
              canonicalId: canonical.id,
            });
            continue;
          }
        }

        // Apply canonical name if LLM returned a better one.
        // nameEmbedding is cleared because it was computed for the old name -
        // persisting a stale embedding would corrupt vector search results.
        if (resolution.name) {
          const node = extractedNodes.find((n) => n.id === extractedId);
          if (node && resolution.name !== node.name) {
            node.name = resolution.name;
            node.nameEmbedding = null;
          }
        }
      }
    }

    const resolvedNodes = extractedNodes.filter((n) => !idMap.has(n.id));

    return {
      resolvedNodes,
      idMap,
      duplicatePairs,
      metrics: {
        'episode.id': episode.id,
        'extracted.count': extractedNodes.length,
        'existing.count': existingNodes.length,
        'resolved.count': resolvedNodes.length,
        'duplicates.count': duplicatePairs.length,
      },
    };
  }
}
