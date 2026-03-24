import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';

import { EntityEdge } from '../models/edges';
import { EpisodicNode } from '../models/nodes';
import { EntityEdgeRepository } from '../neo4j/repositories';
import { luceneSanitize } from '../search/search-filters';
import { buildDedupeEdgesMessages } from './dedupe-edges.prompts';
import {
  cosineSimilarity,
  FACT_SIMILARITY_THRESHOLD,
  MAX_CANDIDATES,
  MAX_KEYWORD_CANDIDATES,
  normalizeString,
} from './resolution-utils';
import { edgeDedupeJsonSchema } from './resolution.types';

export interface EdgeResolutionResult {
  resolvedEdges: EntityEdge[];
  invalidatedEdges: EntityEdge[];
}

@Injectable()
export class EdgeResolutionService {
  constructor(private readonly edgeRepo: EntityEdgeRepository) {}

  async resolveEdges(
    model: BaseChatModel,
    episode: EpisodicNode,
    extractedEdges: EntityEdge[],
    existingEdges: EntityEdge[],
    uuidMap: Map<string, string>,
    referenceTime: Date,
    previousEpisodes: EpisodicNode[] = [],
    customInstructions?: string,
  ): Promise<EdgeResolutionResult> {
    // Step 1: Remap source/target uuids via uuidMap
    const remapped = extractedEdges.map((e) => ({
      ...e,
      sourceNodeUuid: uuidMap.get(e.sourceNodeUuid) ?? e.sourceNodeUuid,
      targetNodeUuid: uuidMap.get(e.targetNodeUuid) ?? e.targetNodeUuid,
    }));

    // Step 2: Intra-batch dedup — same endpoints + same normalized fact → keep first, merge episodes
    const deduped: EntityEdge[] = [];
    for (const edge of remapped) {
      const normalizedFact = normalizeString(edge.fact);
      const existing = deduped.find(
        (d) =>
          d.sourceNodeUuid === edge.sourceNodeUuid &&
          d.targetNodeUuid === edge.targetNodeUuid &&
          normalizeString(d.fact) === normalizedFact,
      );
      if (existing) {
        // Merge episodes into the first occurrence
        for (const ep of edge.episodes) {
          if (!existing.episodes.includes(ep)) {
            existing.episodes.push(ep);
          }
        }
      } else {
        deduped.push({ ...edge });
      }
    }

    const resolvedEdges: EntityEdge[] = [];
    const resolvedExistingUuids = new Set<string>();
    const invalidatedEdgesMap = new Map<string, EntityEdge>();

    for (const edge of deduped) {
      // Find same-endpoint existing edges
      const endpointEdges = existingEdges.filter(
        (e) =>
          (e.sourceNodeUuid === edge.sourceNodeUuid &&
            e.targetNodeUuid === edge.targetNodeUuid) ||
          (e.sourceNodeUuid === edge.targetNodeUuid &&
            e.targetNodeUuid === edge.sourceNodeUuid),
      );

      // Find similar-fact edges (cosine) excluding same-endpoint already found
      const endpointUuids = new Set(endpointEdges.map((e) => e.uuid));

      // Cosine candidates (in-memory)
      const cosineEdges: EntityEdge[] =
        edge.factEmbedding !== null
          ? existingEdges
              .filter(
                (e) => !endpointUuids.has(e.uuid) && e.factEmbedding !== null,
              )
              .map((e) => ({
                edge: e,
                score: cosineSimilarity(edge.factEmbedding!, e.factEmbedding!),
              }))
              .filter((s) => s.score >= FACT_SIMILARITY_THRESHOLD)
              .sort((a, b) => b.score - a.score)
              .slice(0, MAX_CANDIDATES)
              .map((s) => s.edge)
          : [];

      // Keyword candidates (BM25 via Neo4j fulltext)
      const keywordEdges = await this.edgeRepo.searchByFact(
        luceneSanitize(edge.fact),
        [edge.groupId],
        MAX_KEYWORD_CANDIDATES,
      );

      // Merge: cosine-first, then keyword-only additions (deduped, endpoint-excluded)
      const cosineUuids = new Set(cosineEdges.map((e) => e.uuid));
      const keywordOnly = keywordEdges.filter(
        (e) => !endpointUuids.has(e.uuid) && !cosineUuids.has(e.uuid),
      );
      const similarEdges: EntityEdge[] = [...cosineEdges, ...keywordOnly];

      if (endpointEdges.length === 0 && similarEdges.length === 0) {
        resolvedEdges.push(edge);
        continue;
      }

      // Assign integer indices: endpoint edges first, then similar edges
      const endpointWithIdx = endpointEdges.map((e, i) => ({
        idx: i,
        edge: e,
      }));
      const similarOffset = endpointEdges.length;
      const similarWithIdx = similarEdges.map((e, i) => ({
        idx: similarOffset + i,
        edge: e,
      }));

      const idxToEdge = new Map<number, EntityEdge>();
      for (const { idx, edge: e } of endpointWithIdx) idxToEdge.set(idx, e);
      for (const { idx, edge: e } of similarWithIdx) idxToEdge.set(idx, e);

      const messages = buildDedupeEdgesMessages({
        episode,
        previousEpisodes,
        newEdge: { name: edge.name, fact: edge.fact },
        existingEndpointEdges: endpointWithIdx.map(({ idx, edge: e }) => ({
          idx,
          name: e.name,
          fact: e.fact,
        })),
        similarEdges: similarWithIdx.map(({ idx, edge: e }) => ({
          idx,
          name: e.name,
          fact: e.fact,
        })),
        referenceTime,
        customInstructions,
      });

      const dedupe = await model
        .withStructuredOutput(edgeDedupeJsonSchema)
        .invoke(messages);

      // A fact is duplicate only if it matches an endpoint-range index
      const isDuplicate = dedupe.duplicate_facts.some(
        (idx) => idx < endpointEdges.length,
      );

      if (!isDuplicate) {
        resolvedEdges.push(edge);
      } else {
        // Append this episode's UUID to the matching existing endpoint edge(s)
        // and include them in resolvedEdges so they are re-saved with updated episodes.
        // Mirrors Python edge_operations.py:523-524 and 581-582.
        for (const idx of dedupe.duplicate_facts) {
          if (idx < endpointEdges.length) {
            const existingEdge = idxToEdge.get(idx);
            if (existingEdge && !resolvedExistingUuids.has(existingEdge.uuid)) {
              if (!existingEdge.episodes.includes(episode.uuid)) {
                existingEdge.episodes.push(episode.uuid);
              }
              resolvedEdges.push(existingEdge);
              resolvedExistingUuids.add(existingEdge.uuid);
            }
          }
        }
      }

      for (const idx of dedupe.contradicted_facts) {
        const existing = idxToEdge.get(idx);
        if (existing && !invalidatedEdgesMap.has(existing.uuid)) {
          invalidatedEdgesMap.set(existing.uuid, {
            ...existing,
            invalidAt: referenceTime,
            expiredAt: new Date(),
          });
        }
      }
    }

    return {
      resolvedEdges,
      invalidatedEdges: Array.from(invalidatedEdgesMap.values()),
    };
  }
}
