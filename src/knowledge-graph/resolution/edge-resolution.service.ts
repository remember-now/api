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

import {
  compressUuidMap,
  LLM_CONCURRENCY_LIMIT,
  withConcurrency,
} from '../episode/batch-utils';
import { EntityEdge, EpisodicNode } from '../models';
import { buildDedupeEdgesMessages } from '../prompts';
import { EntityEdgeRepository } from '../repository/repositories';
import { SearchByTextParamsSchema } from '../types';
import {
  cosineSimilarity,
  FACT_SIMILARITY_THRESHOLD,
  MAX_CANDIDATES,
  MAX_KEYWORD_CANDIDATES,
  normalizeString,
} from './resolution-utils';
import { edgeDedupeJsonSchema, EdgeResolutionResult } from './types';

@Injectable()
export class EdgeResolutionService {
  constructor(
    private readonly edgeRepo: EntityEdgeRepository,
    @Inject(LLM_TRACER) private readonly llmTracer: LlmTracer,
  ) {}

  async resolveEdges(
    model: BaseChatModel,
    episode: EpisodicNode,
    extractedEdges: EntityEdge[],
    existingEdges: EntityEdge[],
    uuidMap: Map<Uuid, Uuid>,
    referenceTime: Date,
    previousEpisodes: EpisodicNode[] = [],
    customInstructions?: string,
    ctx?: LlmContext,
  ): Promise<EdgeResolutionResult> {
    const { metrics: _m, ...rest } = await this.resolveEdgesImpl(
      model,
      episode,
      extractedEdges,
      existingEdges,
      uuidMap,
      referenceTime,
      previousEpisodes,
      customInstructions,
      ctx,
    );
    return rest;
  }

  @Span('edgeResolution', { onResult: metricsOnResult })
  private async resolveEdgesImpl(
    model: BaseChatModel,
    episode: EpisodicNode,
    extractedEdges: EntityEdge[],
    existingEdges: EntityEdge[],
    uuidMap: Map<Uuid, Uuid>,
    referenceTime: Date,
    previousEpisodes: EpisodicNode[] = [],
    customInstructions?: string,
    ctx?: LlmContext,
  ): Promise<EdgeResolutionResult & { metrics: SpanMetrics }> {
    // Step 1: Remap source/target uuids via uuidMap
    const remapped = extractedEdges.map((e) => ({
      ...e,
      sourceNodeUuid: uuidMap.get(e.sourceNodeUuid) ?? e.sourceNodeUuid,
      targetNodeUuid: uuidMap.get(e.targetNodeUuid) ?? e.targetNodeUuid,
    }));

    // Step 2: Intra-batch dedup - same endpoints + same normalized fact → keep first, merge episodes
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
    const newEdges: EntityEdge[] = [];
    const resolvedExistingUuids = new Set<Uuid>();
    const invalidatedEdgesMap = new Map<Uuid, EntityEdge>();

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
              .filter((e) => !endpointUuids.has(e.uuid) && e.factEmbedding !== null)
              .map((e) => ({
                edge: e,
                score: cosineSimilarity(edge.factEmbedding!, e.factEmbedding!),
              }))
              .filter((s) => s.score >= FACT_SIMILARITY_THRESHOLD)
              .sort((a, b) => b.score - a.score)
              .slice(0, MAX_CANDIDATES)
              .map((s) => s.edge)
          : [];

      // Keyword candidates (BM25 fulltext)
      const keywordEdges = await this.edgeRepo.searchByFact(
        SearchByTextParamsSchema.parse({
          query: edge.fact,
          graphIds: [edge.graphId],
          limit: MAX_KEYWORD_CANDIDATES,
        }),
      );

      // Merge: cosine-first, then keyword-only additions (deduped, endpoint-excluded)
      const cosineUuids = new Set(cosineEdges.map((e) => e.uuid));
      const keywordOnly = keywordEdges.filter(
        (e) => !endpointUuids.has(e.uuid) && !cosineUuids.has(e.uuid),
      );
      const similarEdges: EntityEdge[] = [...cosineEdges, ...keywordOnly];

      if (endpointEdges.length === 0 && similarEdges.length === 0) {
        resolvedEdges.push(edge);
        newEdges.push(edge);
        continue;
      }

      const { dedupe, idxToEdge } = await this.dedupeEdgeViaLlm(
        model,
        edge,
        endpointEdges,
        similarEdges,
        episode,
        previousEpisodes,
        referenceTime,
        customInstructions,
        ctx,
      );

      // A fact is duplicate only if it matches an endpoint-range index
      const isDuplicate = dedupe.duplicate_facts.some(
        (idx) => idx < endpointEdges.length,
      );

      if (!isDuplicate) {
        if (edge.invalidAt && !edge.expiredAt) {
          edge.expiredAt = new Date();
        }

        // Self-expiration - if any contradiction candidate postdates this edge,
        // the edge is superseded by information already in the graph.
        if (!edge.expiredAt) {
          const contradictionCandidates = dedupe.contradicted_facts
            .map((idx) => idxToEdge.get(idx))
            .filter((e): e is EntityEdge => e !== undefined)
            .filter((c) => c.validAt !== null)
            .sort((a, b) => a.validAt!.getTime() - b.validAt!.getTime());
          for (const candidate of contradictionCandidates) {
            if (edge.validAt !== null && candidate.validAt! > edge.validAt) {
              edge.invalidAt = candidate.validAt;
              edge.expiredAt = new Date();
              break;
            }
          }
        }

        resolvedEdges.push(edge);
        newEdges.push(edge);
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

      // Only invalidate existing edges that genuinely overlap with the new edge's
      // validity window and predate it. Mirrors Python resolve_edge_contradictions
      // (edge_operations.py:425-460).
      for (const idx of dedupe.contradicted_facts) {
        const existing = idxToEdge.get(idx);
        if (!existing || invalidatedEdgesMap.has(existing.uuid)) continue;

        const edgeInvalidAt = existing.invalidAt;
        const resolvedValidAt = edge.validAt;
        const edgeValidAt = existing.validAt;
        const resolvedInvalidAt = edge.invalidAt;

        // Skip if there is no temporal overlap between the two edges.
        if (
          (edgeInvalidAt !== null &&
            resolvedValidAt !== null &&
            edgeInvalidAt <= resolvedValidAt) ||
          (edgeValidAt !== null &&
            resolvedInvalidAt !== null &&
            resolvedInvalidAt <= edgeValidAt)
        )
          continue;

        // Only invalidate if the existing edge predates the new edge.
        if (
          edgeValidAt !== null &&
          resolvedValidAt !== null &&
          edgeValidAt < resolvedValidAt
        ) {
          invalidatedEdgesMap.set(existing.uuid, {
            ...existing,
            invalidAt: edge.validAt,
            expiredAt: existing.expiredAt ?? new Date(),
          });
        }
      }
    }

    const invalidatedEdges = Array.from(invalidatedEdgesMap.values());

    return {
      resolvedEdges,
      invalidatedEdges,
      newEdges,
      metrics: {
        'episode.uuid': episode.uuid,
        'extracted.count': extractedEdges.length,
        'existing.count': existingEdges.length,
        'resolved.count': resolvedEdges.length,
        'invalidated.count': invalidatedEdges.length,
        'new.count': newEdges.length,
      },
    };
  }

  // Cross-batch edge dedup. Mirrors upstream `dedupe_edges_bulk`
  // (bulk_utils.py:489): for each batch edge, surface peer edges from other
  // episodes in the same batch as candidates and let the LLM identify
  // duplicates. Without this, two episodes mentioning the same fact would each
  // persist a separate row because per-episode resolution only consults the
  // live graph. Returns deduped per-episode lists where collapsed duplicates
  // are replaced with a single canonical edge whose `episodes` field is the
  // union of the originating episode UUIDs.
  async dedupeAcrossBatch(
    model: BaseChatModel,
    edgesPerEpisode: EntityEdge[][],
    episodes: EpisodicNode[],
    previousEpisodesPerEpisode: EpisodicNode[][],
    customInstructions?: string,
    ctx?: LlmContext,
  ): Promise<EntityEdge[][]> {
    return this.dedupeAcrossBatchImpl(
      model,
      edgesPerEpisode,
      episodes,
      previousEpisodesPerEpisode,
      customInstructions,
      ctx,
    ).then((r) => r.deduped);
  }

  @Span('dedupeAcrossBatch', { onResult: metricsOnResult })
  private async dedupeAcrossBatchImpl(
    model: BaseChatModel,
    edgesPerEpisode: EntityEdge[][],
    episodes: EpisodicNode[],
    previousEpisodesPerEpisode: EpisodicNode[][],
    customInstructions: string | undefined,
    ctx: LlmContext | undefined,
  ): Promise<{ deduped: EntityEdge[][]; metrics: SpanMetrics }> {
    const allEdges = edgesPerEpisode.flat();
    const baseMetrics: SpanMetrics = {
      'episodes.count': episodes.length,
      'edges.in': allEdges.length,
    };

    if (allEdges.length < 2) {
      return { deduped: edgesPerEpisode, metrics: { ...baseMetrics, 'pairs.found': 0 } };
    }

    // Owner index: which episode each edge came from. Edge UUIDs are unique
    // (factory generates randomUUID per extraction), so a Map keyed by uuid
    // is unambiguous.
    const edgeOwner = new Map<Uuid, number>();
    edgesPerEpisode.forEach((edges, i) => {
      for (const e of edges) edgeOwner.set(e.uuid, i);
    });

    type Task = {
      edge: EntityEdge;
      endpointEdges: EntityEdge[];
      similarEdges: EntityEdge[];
    };
    const tasks: Task[] = [];
    for (const edge of allEdges) {
      const endpointEdges: EntityEdge[] = [];
      const similarEdges: EntityEdge[] = [];
      for (const peer of allEdges) {
        if (peer.uuid === edge.uuid) continue;
        const sameEndpoints =
          (peer.sourceNodeUuid === edge.sourceNodeUuid &&
            peer.targetNodeUuid === edge.targetNodeUuid) ||
          (peer.sourceNodeUuid === edge.targetNodeUuid &&
            peer.targetNodeUuid === edge.sourceNodeUuid);
        if (sameEndpoints) {
          endpointEdges.push(peer);
          continue;
        }
        if (
          edge.factEmbedding !== null &&
          peer.factEmbedding !== null &&
          cosineSimilarity(edge.factEmbedding, peer.factEmbedding) >=
            FACT_SIMILARITY_THRESHOLD
        ) {
          similarEdges.push(peer);
        }
      }
      if (endpointEdges.length === 0 && similarEdges.length === 0) continue;
      tasks.push({
        edge,
        endpointEdges,
        similarEdges: similarEdges.slice(0, MAX_CANDIDATES),
      });
    }

    const pairResults = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      tasks.map((t) => async (): Promise<[Uuid, Uuid][]> => {
        const ownerIdx = edgeOwner.get(t.edge.uuid)!;
        const { dedupe, idxToEdge } = await this.dedupeEdgeViaLlm(
          model,
          t.edge,
          t.endpointEdges,
          t.similarEdges,
          episodes[ownerIdx],
          previousEpisodesPerEpisode[ownerIdx],
          episodes[ownerIdx].validAt,
          customInstructions,
          ctx,
        );
        // Only endpoint-range indices (same + reversed) count as duplicates.
        // The similar-topic section is for contradictions; accepting duplicates
        // from it would collapse edges with different endpoints. Matches the
        // guard in `resolveEdges` and upstream `dedupe_edges_bulk` semantics
        // (bulk_utils.py:521-524) which never surfaces non-endpoint duplicates.
        const endpointCount = t.endpointEdges.length;
        const localPairs: [Uuid, Uuid][] = [];
        for (const idx of dedupe.duplicate_facts) {
          if (idx >= endpointCount) continue;
          const peer = idxToEdge.get(idx);
          if (peer) localPairs.push([t.edge.uuid, peer.uuid]);
        }
        return localPairs;
      }),
    );

    const duplicatePairs = pairResults.flat();
    if (duplicatePairs.length === 0) {
      return {
        deduped: edgesPerEpisode,
        metrics: { ...baseMetrics, 'pairs.found': 0, 'edges.out': allEdges.length },
      };
    }

    // Union-find collapses transitive duplicates and picks lex-smallest UUID
    // as canonical. Build canonical edge objects with merged episode UUIDs.
    const uuidMap = compressUuidMap<Uuid>(duplicatePairs);
    const edgesByUuid = new Map<Uuid, EntityEdge>(allEdges.map((e) => [e.uuid, e]));
    const canonicalByUuid = new Map<Uuid, EntityEdge>();

    for (const edge of allEdges) {
      const canonicalUuid = uuidMap.get(edge.uuid) ?? edge.uuid;
      if (canonicalUuid === edge.uuid) {
        canonicalByUuid.set(canonicalUuid, edge);
      }
    }
    for (const edge of allEdges) {
      const canonicalUuid = uuidMap.get(edge.uuid) ?? edge.uuid;
      if (canonicalUuid === edge.uuid) continue;
      const canonical = canonicalByUuid.get(canonicalUuid);
      if (!canonical) continue;
      for (const ep of edge.episodes) {
        if (!canonical.episodes.includes(ep)) canonical.episodes.push(ep);
      }
    }

    const deduped = edgesPerEpisode.map((edges) => {
      const seen = new Set<Uuid>();
      const out: EntityEdge[] = [];
      for (const edge of edges) {
        const canonicalUuid = uuidMap.get(edge.uuid) ?? edge.uuid;
        if (seen.has(canonicalUuid)) continue;
        seen.add(canonicalUuid);
        out.push(
          canonicalByUuid.get(canonicalUuid) ?? edgesByUuid.get(canonicalUuid) ?? edge,
        );
      }
      return out;
    });

    return {
      deduped,
      metrics: {
        ...baseMetrics,
        'pairs.found': duplicatePairs.length,
        'edges.out': deduped.reduce((s, a) => s + a.length, 0),
      },
    };
  }

  // Shared LLM-driven dedup call used by both per-episode `resolveEdges` and
  // batch-wide `dedupeAcrossBatch`. Builds the integer-indexed candidate list,
  // invokes the structured-output prompt, and returns the raw decisions plus
  // the idx → edge map so callers can act on duplicate_facts / contradicted_facts.
  private async dedupeEdgeViaLlm(
    model: BaseChatModel,
    edge: EntityEdge,
    endpointEdges: EntityEdge[],
    similarEdges: EntityEdge[],
    episode: EpisodicNode,
    previousEpisodes: EpisodicNode[],
    referenceTime: Date,
    customInstructions: string | undefined,
    ctx: LlmContext | undefined,
  ): Promise<{
    dedupe: { duplicate_facts: number[]; contradicted_facts: number[] };
    idxToEdge: Map<number, EntityEdge>;
  }> {
    // Split endpoint candidates by direction so the LLM can treat reversed
    // pairs as duplicates only for symmetric relations. Indices stay
    // continuous: same → reversed → similar.
    const sameDirection = endpointEdges.filter(
      (e) => e.sourceNodeUuid === edge.sourceNodeUuid,
    );
    const reversedDirection = endpointEdges.filter(
      (e) => e.sourceNodeUuid !== edge.sourceNodeUuid,
    );

    const sameWithIdx = sameDirection.map((e, i) => ({ idx: i, edge: e }));
    const reversedOffset = sameDirection.length;
    const reversedWithIdx = reversedDirection.map((e, i) => ({
      idx: reversedOffset + i,
      edge: e,
    }));
    const similarOffset = reversedOffset + reversedDirection.length;
    const similarWithIdx = similarEdges.map((e, i) => ({
      idx: similarOffset + i,
      edge: e,
    }));

    const idxToEdge = new Map<number, EntityEdge>();
    for (const { idx, edge: e } of sameWithIdx) idxToEdge.set(idx, e);
    for (const { idx, edge: e } of reversedWithIdx) idxToEdge.set(idx, e);
    for (const { idx, edge: e } of similarWithIdx) idxToEdge.set(idx, e);

    const messages = buildDedupeEdgesMessages({
      episode,
      previousEpisodes,
      newEdge: { name: edge.name, fact: edge.fact },
      sameDirectionEdges: sameWithIdx.map(({ idx, edge: e }) => ({
        idx,
        name: e.name,
        fact: e.fact,
      })),
      reversedDirectionEdges: reversedWithIdx.map(({ idx, edge: e }) => ({
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
      .invoke(messages, {
        callbacks: this.llmTracer.getCallbacks(ctx),
        runName: 'resolve-edges',
        tags: ['knowledge-graph', 'resolution.edge'],
      });

    return { dedupe, idxToEdge };
  }
}
