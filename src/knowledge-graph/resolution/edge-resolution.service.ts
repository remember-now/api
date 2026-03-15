import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';

import { EntityEdge } from '../models/edges';
import { EpisodicNode } from '../models/nodes';
import { buildDedupeEdgesMessages } from './dedupe-edges.prompts';
import {
  cosineSimilarity,
  FACT_SIMILARITY_THRESHOLD,
  MAX_CANDIDATES,
  normalizeString,
} from './resolution-utils';
import {
  EdgeDedupe,
  edgeDedupeJsonSchema,
  EdgeDedupeSchema,
} from './resolution.types';

export interface EdgeResolutionResult {
  resolvedEdges: EntityEdge[];
  invalidatedEdges: EntityEdge[];
}

@Injectable()
export class EdgeResolutionService {
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
    const invalidatedEdgesMap = new Map<string, EntityEdge>();
    const existingByUuid = new Map(existingEdges.map((e) => [e.uuid, e]));

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
      const similarEdges =
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

      if (endpointEdges.length === 0 && similarEdges.length === 0) {
        resolvedEdges.push(edge);
        continue;
      }

      const messages = buildDedupeEdgesMessages({
        episode,
        previousEpisodes,
        newEdge: { uuid: edge.uuid, name: edge.name, fact: edge.fact },
        existingEndpointEdges: endpointEdges.map((e) => ({
          uuid: e.uuid,
          name: e.name,
          fact: e.fact,
        })),
        similarEdges: similarEdges.map((e) => ({
          uuid: e.uuid,
          name: e.name,
          fact: e.fact,
        })),
        referenceTime,
        customInstructions,
      });

      const raw = await model
        .withStructuredOutput(edgeDedupeJsonSchema)
        .invoke(messages);

      const parsed = EdgeDedupeSchema.safeParse(raw);
      const dedupe: EdgeDedupe = parsed.success
        ? parsed.data
        : { duplicate_fact_uuids: [], contradicted_fact_uuids: [] };

      const isDuplicate = dedupe.duplicate_fact_uuids.length > 0;

      if (!isDuplicate) {
        resolvedEdges.push(edge);
      }

      for (const contradictedUuid of dedupe.contradicted_fact_uuids) {
        const existing = existingByUuid.get(contradictedUuid);
        if (existing && !invalidatedEdgesMap.has(contradictedUuid)) {
          invalidatedEdgesMap.set(contradictedUuid, {
            ...existing,
            invalidAt: referenceTime,
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
