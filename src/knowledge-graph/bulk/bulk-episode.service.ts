import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { LlmService } from '@/llm/llm.service';

import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import {
  EdgeTypeMap,
  getApplicableEdgeTypes,
  nodeSummaryJsonSchema,
} from '../episode/episode.types';
import { buildNodeSummaryMessages } from '../episode/node-summary.prompts';
import {
  CombinedExtractionService,
  EdgeExtractionService,
  NodeExtractionService,
} from '../extraction';
import {
  createEpisodicEdge,
  createEpisodicNode,
  EntityEdge,
  EntityNode,
} from '../models';
import {
  GroupIdSchema,
  RetrieveEpisodesParamsSchema,
  SearchBySimilarityParamsSchema,
  SearchByTextParamsSchema,
} from '../neo4j';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
} from '../neo4j/repositories';
import {
  buildExtractEdgeAttributesMessages,
  buildExtractEntityAttributesMessages,
} from '../prompts';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import {
  COSINE_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  normalizeString,
} from '../resolution/resolution-utils';
import {
  buildDirectedUuidMap,
  LLM_CONCURRENCY_LIMIT,
  resolveEdgePointers,
  withConcurrency,
} from './bulk-utils';
import { AddBulkEpisodeOptions, AddBulkEpisodeResult } from './bulk.types';
import { chunkContent, shouldChunk } from './content-chunking';

const PREVIOUS_EPISODES_WINDOW = 20;
const MAX_NODES_PER_SUMMARY_BATCH = 30;
const CANDIDATE_LIMIT = 10;

function reassembleByOffsets<T>(flat: T[], lengths: number[]): T[][] {
  let offset = 0;
  return lengths.map((len) => {
    const slice = flat.slice(offset, offset + len);
    offset += len;
    return slice;
  });
}

@Injectable()
export class BulkEpisodeService {
  constructor(
    private readonly llmService: LlmService,
    private readonly communityService: CommunityService,
    private readonly embeddingService: EmbeddingService,
    private readonly nodeExtractionService: NodeExtractionService,
    private readonly edgeExtractionService: EdgeExtractionService,
    private readonly combinedExtractionService: CombinedExtractionService,
    private readonly nodeResolutionService: NodeResolutionService,
    private readonly edgeResolutionService: EdgeResolutionService,
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly entityEdgeRepository: EntityEdgeRepository,
    private readonly episodicNodeRepository: EpisodicNodeRepository,
    private readonly episodicEdgeRepository: EpisodicEdgeRepository,
  ) {}

  async addEpisodesBulk(
    options: AddBulkEpisodeOptions,
  ): Promise<AddBulkEpisodeResult> {
    const {
      userId,
      episodes,
      entityTypes,
      edgeTypes,
      edgeTypeMap,
      excludedEntityTypes,
      customInstructions,
      updateCommunities,
      useCombinedExtraction = false,
    } = options;

    const effectiveEdgeTypeMap: EdgeTypeMap | undefined =
      edgeTypeMap ??
      (edgeTypes ? { 'Entity,Entity': Object.keys(edgeTypes) } : undefined);

    // 1. Guard
    if (episodes.length === 0) {
      return {
        episodes: [],
        nodes: [],
        edges: [],
        invalidatedEdges: [],
        episodicEdges: [],
      };
    }
    for (const ep of episodes) {
      GroupIdSchema.parse(ep.groupId);
    }

    // 2. Get model
    const model = await this.llmService.getActiveModel(userId);

    // 3. Create episodic nodes (apply uuid override if provided)
    const episodicNodes = episodes.map((raw) => {
      const node = createEpisodicNode({
        name: raw.name,
        content: raw.content,
        source: raw.source,
        sourceDescription: raw.sourceDescription,
        groupId: raw.groupId,
        validAt: raw.referenceTime,
      });
      return raw.uuid ? { ...node, uuid: raw.uuid } : node;
    });

    // 4. Save all episodic nodes
    await this.episodicNodeRepository.saveBulk(episodicNodes);

    // 5. Retrieve previous episodes in parallel
    const prevEpisodesPerEpisode = await Promise.all(
      episodicNodes.map((ep) =>
        this.episodicNodeRepository.retrieveEpisodes(
          RetrieveEpisodesParamsSchema.parse({
            referenceTime: ep.validAt,
            lastN: PREVIOUS_EPISODES_WINDOW,
            groupIds: [ep.groupId],
          }),
        ),
      ),
    );

    // 6. Extract nodes (and edges, if using combined extraction) in parallel
    // Combined path: single LLM call per episode yields both nodes and edges.
    // Separate path: node extraction only; edges are extracted later in step 13.
    let preExtractedEdgesPerEpisode: EntityEdge[][] | null = null;

    const extractedNodesPerEpisode = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      episodicNodes.map((ep, i) => async () => {
        if (useCombinedExtraction) {
          const { nodes, edges } =
            await this.combinedExtractionService.extractNodesAndEdges(
              model,
              [ep],
              entityTypes,
              edgeTypes,
              effectiveEdgeTypeMap,
              customInstructions,
              excludedEntityTypes,
            );
          // Stash edges for use in step 13 (index is stable because withConcurrency
          // preserves order for this mapping pattern).
          (preExtractedEdgesPerEpisode ??= Array(episodicNodes.length).fill(
            [],
          ))[i] = edges;
          return nodes;
        }

        if (shouldChunk(ep.content)) {
          const chunks = await chunkContent(ep.content, ep.source);
          const perChunk = await Promise.all(
            chunks.map((chunk) =>
              this.nodeExtractionService.extractNodes(
                model,
                { ...ep, content: chunk },
                prevEpisodesPerEpisode[i],
                entityTypes,
                customInstructions,
                excludedEntityTypes,
              ),
            ),
          );
          // Deduplicate nodes across chunks by case-insensitive name (first occurrence wins)
          const nodesByName = new Map<string, EntityNode>();
          for (const nodes of perChunk) {
            for (const node of nodes) {
              const key = node.name.toLowerCase();
              if (!nodesByName.has(key)) nodesByName.set(key, node);
            }
          }
          return [...nodesByName.values()];
        }
        return this.nodeExtractionService.extractNodes(
          model,
          ep,
          prevEpisodesPerEpisode[i],
          entityTypes,
          customInstructions,
          excludedEntityTypes,
        );
      }),
    );

    // 7. Embed all extracted nodes (batch)
    const allExtractedNodes = extractedNodesPerEpisode.flat();
    const allEmbedded =
      await this.embeddingService.embedNodes(allExtractedNodes);
    const embeddedPerEpisode = reassembleByOffsets(
      allEmbedded,
      extractedNodesPerEpisode.map((a) => a.length),
    );

    // 8. Collect search-based node candidates per episode
    const groupIds = [...new Set(episodes.map((e) => e.groupId))];
    const candidatesPerEpisode = await Promise.all(
      embeddedPerEpisode.map((nodes, i) =>
        this.collectNodeCandidates(nodes, episodicNodes[i].groupId),
      ),
    );
    const existingNodesMap = new Map(
      candidatesPerEpisode.flat().map((n) => [n.uuid, n]),
    );

    // 9. Pass 1 — resolve nodes vs live graph in parallel
    const nodeResolutions = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      embeddedPerEpisode.map(
        (nodes, i) => () =>
          this.nodeResolutionService.resolveNodes(
            model,
            episodicNodes[i],
            nodes,
            candidatesPerEpisode[i],
            prevEpisodesPerEpisode[i],
            customInstructions,
          ),
      ),
    );

    // 10. Merge duplicate pairs from pass 1
    const pass1Pairs: [string, string][] = nodeResolutions.flatMap((r) =>
      r.duplicatePairs.map((p): [string, string] => [
        p.extractedUuid,
        p.canonicalUuid,
      ]),
    );

    // 11. Pass 2 — within-batch dedup: exact name match first, then cosine
    const allNewNodes = nodeResolutions.flatMap((r) => r.resolvedNodes);
    const pass2Pairs: [string, string][] = [];
    for (let i = 0; i < allNewNodes.length; i++) {
      for (let j = i + 1; j < allNewNodes.length; j++) {
        const a = allNewNodes[i];
        const b = allNewNodes[j];

        const exactMatch = normalizeString(a.name) === normalizeString(b.name);
        const cosineMatch =
          !exactMatch &&
          a.nameEmbedding !== null &&
          b.nameEmbedding !== null &&
          cosineSimilarity(a.nameEmbedding, b.nameEmbedding) >=
            COSINE_SIMILARITY_THRESHOLD;

        if (exactMatch || cosineMatch) {
          pass2Pairs.push([b.uuid, a.uuid]); // b is alias → a (first-seen) is canonical
        }
      }
    }

    const finalUuidMap = buildDirectedUuidMap([...pass1Pairs, ...pass2Pairs]);

    // 12. Determine canonical nodes per episode
    const canonicalNodesPerEpisode = nodeResolutions.map((resolution) => {
      const ownCanonical = resolution.resolvedNodes.filter(
        (n) => (finalUuidMap.get(n.uuid) ?? n.uuid) === n.uuid,
      );
      // Include existing nodes referenced as canonical targets
      const matchedExisting = resolution.duplicatePairs
        .map((p) => {
          const canonical =
            finalUuidMap.get(p.canonicalUuid) ?? p.canonicalUuid;
          return existingNodesMap.get(canonical);
        })
        .filter((n): n is NonNullable<typeof n> => n !== undefined);

      const seen = new Set<string>();
      const merged = [...ownCanonical, ...matchedExisting].filter((n) => {
        if (seen.has(n.uuid)) return false;
        seen.add(n.uuid);
        return true;
      });
      return merged;
    });

    // 13. Extract edges in parallel, then resolve pointers.
    // Combined path: edges were already extracted in step 6; remap node UUIDs via finalUuidMap.
    // Separate path: extract edges using the canonical nodes resolved above.
    const rawEdgesPerEpisode = preExtractedEdgesPerEpisode
      ? preExtractedEdgesPerEpisode
      : await withConcurrency(
          LLM_CONCURRENCY_LIMIT,
          episodicNodes.map(
            (ep, i) => () =>
              this.edgeExtractionService.extractEdges(
                model,
                ep,
                canonicalNodesPerEpisode[i],
                prevEpisodesPerEpisode[i],
                ep.validAt,
                customInstructions,
                edgeTypes,
                effectiveEdgeTypeMap,
              ),
          ),
        );

    const pointedEdgesPerEpisode = rawEdgesPerEpisode.map((edges) =>
      resolveEdgePointers(edges, finalUuidMap),
    );

    // 14. Embed all extracted edges (batch)
    const allExtractedEdges = pointedEdgesPerEpisode.flat();
    const allEmbeddedEdges =
      await this.embeddingService.embedEdges(allExtractedEdges);
    const embeddedEdgesPerEpisode = reassembleByOffsets(
      allEmbeddedEdges,
      pointedEdgesPerEpisode.map((a) => a.length),
    );

    // 15. Collect search-based edge candidates per episode
    const edgeCandidatesPerEpisode = await Promise.all(
      embeddedEdgesPerEpisode.map((edges, i) =>
        this.collectEdgeCandidates(edges, episodicNodes[i].groupId),
      ),
    );

    // 16. Resolve edges in parallel
    const edgeResolutions = await withConcurrency(
      LLM_CONCURRENCY_LIMIT,
      episodicNodes.map(
        (ep, i) => () =>
          this.edgeResolutionService.resolveEdges(
            model,
            ep,
            embeddedEdgesPerEpisode[i],
            edgeCandidatesPerEpisode[i],
            finalUuidMap,
            ep.validAt,
            prevEpisodesPerEpisode[i],
            customInstructions,
          ),
      ),
    );

    const allResolvedEdges = edgeResolutions.flatMap((r) => r.resolvedEdges);
    const allInvalidatedEdges = edgeResolutions.flatMap(
      (r) => r.invalidatedEdges,
    );

    edgeResolutions.forEach((res, i) => {
      episodicNodes[i].entityEdges = [
        ...res.resolvedEdges,
        ...res.invalidatedEdges,
      ].map((e) => e.uuid);
    });

    // 16.5. Extract edge attributes for resolved edges (custom edge types)
    const allCanonicalNodes = [
      ...new Map(
        canonicalNodesPerEpisode.flat().map((n) => [n.uuid, n]),
      ).values(),
    ];
    if (edgeTypes && effectiveEdgeTypeMap) {
      const uuidToNode = new Map<string, EntityNode>(
        allCanonicalNodes.map((n) => [n.uuid, n]),
      );

      type EdgeAttrTask = { edge: EntityEdge; epIndex: number };
      const edgeAttrTasks: EdgeAttrTask[] = [];

      edgeResolutions.forEach((res, epIndex) => {
        for (const edge of res.resolvedEdges) {
          const src = uuidToNode.get(edge.sourceNodeUuid);
          const tgt = uuidToNode.get(edge.targetNodeUuid);
          if (!src || !tgt) continue;
          const applicable = getApplicableEdgeTypes(
            src.labels,
            tgt.labels,
            edgeTypes,
            effectiveEdgeTypeMap,
          );
          const typeDef = applicable[edge.name];
          if (!typeDef) continue;
          const jsonSchema = z.toJSONSchema(typeDef.schema) as {
            properties?: Record<string, unknown>;
          };
          if (Object.keys(jsonSchema.properties ?? {}).length === 0) continue;
          edgeAttrTasks.push({ edge, epIndex });
        }
      });

      await withConcurrency(
        LLM_CONCURRENCY_LIMIT,
        edgeAttrTasks.map(({ edge, epIndex }) => async () => {
          const src = uuidToNode.get(edge.sourceNodeUuid)!;
          const tgt = uuidToNode.get(edge.targetNodeUuid)!;
          const applicable = getApplicableEdgeTypes(
            src.labels,
            tgt.labels,
            edgeTypes,
            effectiveEdgeTypeMap,
          );
          const typeDef = applicable[edge.name];
          const jsonSchema = z.toJSONSchema(typeDef.schema);
          const attrs = (await model.withStructuredOutput(jsonSchema).invoke(
            buildExtractEdgeAttributesMessages({
              fact: edge.fact,
              referenceTime: episodicNodes[epIndex].validAt,
              existingAttributes: edge.attributes ?? {},
            }),
          )) as Record<string, unknown>;
          edge.attributes = { ...edge.attributes, ...attrs };
        }),
      );
    }

    // 17. Generate node summaries for all new canonical nodes
    const newNodesOnly = allCanonicalNodes.filter(
      (n) => !existingNodesMap.has(n.uuid),
    );

    if (newNodesOnly.length > 0) {
      const nodesInput = newNodesOnly.map((n) => ({
        uuid: n.uuid,
        name: n.name,
        summary: n.summary,
        facts: allResolvedEdges
          .filter(
            (e) => e.sourceNodeUuid === n.uuid || e.targetNodeUuid === n.uuid,
          )
          .map((e) => e.fact),
      }));

      const summaryMap = new Map<string, string>();
      for (let i = 0; i < nodesInput.length; i += MAX_NODES_PER_SUMMARY_BATCH) {
        const batch = nodesInput.slice(i, i + MAX_NODES_PER_SUMMARY_BATCH);
        // TODO: Uses episodicNodes[0] as context for ALL summary batches.
        // Nodes from later episodes get summarized with episode-0's context, which
        // degrades quality for diverse batches. Fix: group canonical nodes by their
        // originating episode and summarize each group with its own context.
        const summaryMessages = buildNodeSummaryMessages({
          episode: episodicNodes[0],
          previousEpisodes: prevEpisodesPerEpisode[0],
          nodes: batch,
        });

        const summaryResult = await model
          .withStructuredOutput(nodeSummaryJsonSchema)
          .invoke(summaryMessages);

        for (const s of summaryResult.summaries as {
          uuid: string;
          summary: string;
        }[]) {
          summaryMap.set(s.uuid, s.summary);
        }
      }

      for (const node of newNodesOnly) {
        const summary = summaryMap.get(node.uuid);
        if (summary !== undefined) node.summary = summary;
      }
    }

    // 17.5. Extract entity attributes for new canonical nodes (post-resolution, with edge context)
    const nodeToEpisodeCtx = new Map<
      string,
      {
        episode: (typeof episodicNodes)[0];
        prevEpisodes: (typeof prevEpisodesPerEpisode)[0];
      }
    >();
    canonicalNodesPerEpisode.forEach((nodes, i) => {
      for (const n of nodes) {
        if (!nodeToEpisodeCtx.has(n.uuid)) {
          nodeToEpisodeCtx.set(n.uuid, {
            episode: episodicNodes[i],
            prevEpisodes: prevEpisodesPerEpisode[i],
          });
        }
      }
    });
    for (const node of newNodesOnly) {
      const label = node.labels.find((l) => l !== 'Entity');
      const entityType = label ? entityTypes?.[label] : undefined;
      if (entityType) {
        const ctx = nodeToEpisodeCtx.get(node.uuid);
        if (!ctx) continue;
        const nodeEdges = allResolvedEdges.filter(
          (e) =>
            e.sourceNodeUuid === node.uuid || e.targetNodeUuid === node.uuid,
        );
        const attrMessages = buildExtractEntityAttributesMessages({
          episodeContent: ctx.episode.content,
          previousEpisodesContent: ctx.prevEpisodes.map((ep) => ep.content),
          relatedFacts: nodeEdges.map((e) => e.fact),
          referenceTime: ctx.episode.validAt,
          existingAttributes: node.attributes ?? {},
        });
        const attrs = (await model
          .withStructuredOutput(z.toJSONSchema(entityType.schema))
          .invoke(attrMessages)) as Record<string, unknown>;
        node.attributes = { ...node.attributes, ...attrs };
      }
    }

    // 18. Create episodic edges
    const allEpisodicEdges = episodicNodes.flatMap((ep, i) =>
      canonicalNodesPerEpisode[i].map((node) =>
        createEpisodicEdge({
          sourceNodeUuid: ep.uuid,
          targetNodeUuid: node.uuid,
          groupId: ep.groupId,
        }),
      ),
    );

    // 19. Persist in parallel
    await Promise.all([
      this.entityNodeRepository.saveBulk(allCanonicalNodes),
      this.entityEdgeRepository.saveBulk(allResolvedEdges),
      this.entityEdgeRepository.saveBulk(allInvalidatedEdges),
      this.episodicEdgeRepository.saveBulk(allEpisodicEdges),
      this.episodicNodeRepository.saveBulk(episodicNodes),
    ]);

    // 20. Optional community build
    // TODO: Concurrent addEpisodesBulk calls for the same groupId can race here —
    // two community builds may project conflicting graph snapshots and race on
    // deleteByGroupId. Investigate a per-groupId mutex or advisory lock before
    // enabling concurrent bulk ingestion.
    if (updateCommunities) {
      await Promise.all(
        groupIds.map((gid) =>
          this.communityService.buildCommunities(userId, gid),
        ),
      );
    }

    return {
      episodes: episodicNodes,
      nodes: allCanonicalNodes,
      edges: allResolvedEdges,
      invalidatedEdges: allInvalidatedEdges,
      episodicEdges: allEpisodicEdges,
    };
  }

  private async collectNodeCandidates(
    nodes: EntityNode[],
    groupId: string,
  ): Promise<EntityNode[]> {
    const results = await Promise.all(
      nodes.flatMap((n) => [
        this.entityNodeRepository.searchByName(
          SearchByTextParamsSchema.parse({
            query: n.name,
            groupIds: [groupId],
            limit: CANDIDATE_LIMIT,
          }),
        ),
        n.nameEmbedding !== null
          ? this.entityNodeRepository.searchBySimilarity(
              SearchBySimilarityParamsSchema.parse({
                embedding: n.nameEmbedding,
                groupIds: [groupId],
                limit: CANDIDATE_LIMIT,
              }),
            )
          : Promise.resolve([] as EntityNode[]),
      ]),
    );
    const seen = new Set<string>();
    return results.flat().filter((n) => {
      if (seen.has(n.uuid)) return false;
      seen.add(n.uuid);
      return true;
    });
  }

  private async collectEdgeCandidates(
    edges: EntityEdge[],
    groupId: string,
  ): Promise<EntityEdge[]> {
    const results = await Promise.all(
      edges.flatMap((e) => [
        this.entityEdgeRepository.searchByFact(
          SearchByTextParamsSchema.parse({
            query: e.fact,
            groupIds: [groupId],
            limit: CANDIDATE_LIMIT,
          }),
        ),
        e.factEmbedding !== null
          ? this.entityEdgeRepository.searchBySimilarity(
              SearchBySimilarityParamsSchema.parse({
                embedding: e.factEmbedding,
                groupIds: [groupId],
                limit: CANDIDATE_LIMIT,
              }),
            )
          : Promise.resolve([] as EntityEdge[]),
      ]),
    );
    const seen = new Set<string>();
    return results.flat().filter((e) => {
      if (seen.has(e.uuid)) return false;
      seen.add(e.uuid);
      return true;
    });
  }
}
