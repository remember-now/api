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
import { nodeResolutionsJsonSchema } from './resolution.types';

export interface NodeResolutionResult {
  resolvedNodes: EntityNode[];
  uuidMap: Map<string, string>;
  duplicatePairs: Array<{ extractedUuid: string; canonicalUuid: string }>;
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
    const duplicatePairs: Array<{
      extractedUuid: string;
      canonicalUuid: string;
    }> = [];
    const llmCandidates = new Map<string, EntityNode[]>();

    for (const extracted of extractedNodes) {
      const normalizedName = normalizeString(extracted.name);

      // Exact match check
      const exactMatch = existingNodes.find(
        (n) => normalizeString(n.name) === normalizedName,
      );
      if (exactMatch) {
        uuidMap.set(extracted.uuid, exactMatch.uuid);
        duplicatePairs.push({
          extractedUuid: extracted.uuid,
          canonicalUuid: exactMatch.uuid,
        });
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
          // TODO: A single candidate above the cosine threshold is treated as a
          // definitive match to avoid an LLM call. This could merge distinct entities
          // that happen to have similar embeddings; consider raising the threshold or
          // always going to LLM for borderline scores.
          uuidMap.set(extracted.uuid, scored[0].node.uuid);
          duplicatePairs.push({
            extractedUuid: extracted.uuid,
            canonicalUuid: scored[0].node.uuid,
          });
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
      const llmExtractedWithIdx = extractedNodes
        .filter((n) => llmCandidates.has(n.uuid))
        .map((n, idx) => ({ id: idx, name: n.name, uuid: n.uuid }));

      const idxToUuid = new Map(llmExtractedWithIdx.map((e) => [e.id, e.uuid]));

      // Collect unique candidate nodes across all batches
      const candidateSet = new Map<string, EntityNode>();
      for (const candidates of llmCandidates.values()) {
        for (const c of candidates) {
          candidateSet.set(c.uuid, c);
        }
      }
      const allCandidates = Array.from(candidateSet.values()).map((n) => ({
        name: n.name,
      }));

      const existingByName = new Map(
        existingNodes.map((n) => [n.name.toLowerCase(), n]),
      );

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
        .invoke(messages);

      const resolutions = raw.entity_resolutions;

      for (const resolution of resolutions) {
        const extractedUuid = idxToUuid.get(resolution.id);
        if (!extractedUuid) continue;

        if (resolution.duplicate_name && resolution.duplicate_name !== '') {
          const canonical = existingByName.get(
            resolution.duplicate_name.toLowerCase(),
          );
          if (canonical) {
            uuidMap.set(extractedUuid, canonical.uuid);
            duplicatePairs.push({
              extractedUuid,
              canonicalUuid: canonical.uuid,
            });
            continue;
          }
        }

        // Apply canonical name if LLM returned a better one
        if (resolution.name) {
          const node = extractedNodes.find((n) => n.uuid === extractedUuid);
          if (node && resolution.name !== node.name) {
            node.name = resolution.name;
          }
        }
      }
    }

    const resolvedNodes = extractedNodes.filter((n) => !uuidMap.has(n.uuid));

    return { resolvedNodes, uuidMap, duplicatePairs };
  }
}
