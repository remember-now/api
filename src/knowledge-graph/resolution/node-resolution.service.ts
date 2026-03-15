import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';

import { EntityNode } from '../models/nodes';
import { EpisodicNode } from '../models/nodes';
import { buildDedupeNodesMessages } from './dedupe-nodes.prompts';
import {
  COSINE_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  LOW_ENTROPY_THRESHOLD,
  MAX_CANDIDATES,
  normalizeString,
  shannonEntropy,
} from './resolution-utils';
import {
  NodeResolutions,
  nodeResolutionsJsonSchema,
  NodeResolutionsSchema,
} from './resolution.types';

export interface NodeResolutionResult {
  resolvedNodes: EntityNode[];
  uuidMap: Map<string, string>;
}

@Injectable()
export class NodeResolutionService {
  async resolveNodes(
    model: BaseChatModel,
    episode: EpisodicNode,
    extractedNodes: EntityNode[],
    existingNodes: EntityNode[],
    previousEpisodes: EpisodicNode[] = [],
    customInstructions?: string,
  ): Promise<NodeResolutionResult> {
    const uuidMap = new Map<string, string>();
    const llmCandidates = new Map<string, EntityNode[]>();

    for (const extracted of extractedNodes) {
      const normalizedName = normalizeString(extracted.name);

      // Exact match check
      const exactMatch = existingNodes.find(
        (n) => normalizeString(n.name) === normalizedName,
      );
      if (exactMatch) {
        uuidMap.set(extracted.uuid, exactMatch.uuid);
        continue;
      }

      // Low entropy → skip cosine, go to LLM with all existing as candidates
      if (
        shannonEntropy(normalizedName) < LOW_ENTROPY_THRESHOLD &&
        existingNodes.length > 0
      ) {
        llmCandidates.set(extracted.uuid, existingNodes);
        continue;
      }

      // Cosine similarity scan
      const embeddingCandidates = existingNodes.filter(
        (n) => n.nameEmbedding !== null,
      );

      if (extracted.nameEmbedding !== null && embeddingCandidates.length > 0) {
        const scored = embeddingCandidates
          .map((n) => ({
            node: n,
            score: cosineSimilarity(extracted.nameEmbedding!, n.nameEmbedding!),
          }))
          .filter((s) => s.score >= COSINE_SIMILARITY_THRESHOLD)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_CANDIDATES);

        if (scored.length === 1) {
          // Deterministic single match
          uuidMap.set(extracted.uuid, scored[0].node.uuid);
          continue;
        } else if (scored.length > 1) {
          llmCandidates.set(
            extracted.uuid,
            scored.map((s) => s.node),
          );
          continue;
        }
        // 0 matches → new node, falls through
      }
    }

    // Batch LLM call for all ambiguous nodes
    if (llmCandidates.size > 0) {
      const llmExtracted = extractedNodes
        .filter((n) => llmCandidates.has(n.uuid))
        .map((n) => ({ uuid: n.uuid, name: n.name }));

      // Collect unique candidate nodes across all batches
      const candidateSet = new Map<string, EntityNode>();
      for (const candidates of llmCandidates.values()) {
        for (const c of candidates) {
          candidateSet.set(c.uuid, c);
        }
      }
      const allCandidates = Array.from(candidateSet.values()).map((n) => ({
        uuid: n.uuid,
        name: n.name,
      }));

      const messages = buildDedupeNodesMessages({
        episode,
        previousEpisodes,
        extractedNodes: llmExtracted,
        candidateNodes: allCandidates,
        customInstructions,
      });

      const raw = await model
        .withStructuredOutput(nodeResolutionsJsonSchema)
        .invoke(messages);

      const parsed = NodeResolutionsSchema.safeParse(raw);
      const resolutions: NodeResolutions['entity_resolutions'] = parsed.success
        ? parsed.data.entity_resolutions
        : [];

      const existingByUuid = new Map(existingNodes.map((n) => [n.uuid, n]));

      for (const resolution of resolutions) {
        if (
          resolution.duplicate_of !== null &&
          existingByUuid.has(resolution.duplicate_of)
        ) {
          uuidMap.set(resolution.uuid, resolution.duplicate_of);
        }
      }
    }

    const resolvedNodes = extractedNodes.filter((n) => !uuidMap.has(n.uuid));

    return { resolvedNodes, uuidMap };
  }
}
