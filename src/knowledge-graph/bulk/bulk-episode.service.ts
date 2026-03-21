import { Injectable } from '@nestjs/common';

import { LlmService } from '@/llm/llm.service';

import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { nodeSummaryJsonSchema } from '../episode/episode.types';
import { buildNodeSummaryMessages } from '../episode/node-summary.prompts';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import { createEpisodicEdge } from '../models/edges';
import { createEpisodicNode } from '../models/nodes';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
} from '../neo4j/repositories';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import {
  COSINE_SIMILARITY_THRESHOLD,
  cosineSimilarity,
} from '../resolution/resolution-utils';
import { buildDirectedUuidMap, resolveEdgePointers } from './bulk-utils';
import { AddBulkEpisodeOptions, AddBulkEpisodeResult } from './bulk.types';

const PREVIOUS_EPISODES_WINDOW = 20;

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
      customInstructions,
      updateCommunities,
    } = options;

    // 1. Guard
    if (episodes.length === 0) {
      return { episodes: [], nodes: [], edges: [], episodicEdges: [] };
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
          ep.validAt,
          PREVIOUS_EPISODES_WINDOW,
          [ep.groupId],
        ),
      ),
    );

    // 6. Extract nodes in parallel
    const extractedNodesPerEpisode = await Promise.all(
      episodicNodes.map((ep, i) =>
        this.nodeExtractionService.extractNodes(
          model,
          ep,
          prevEpisodesPerEpisode[i],
          entityTypes,
          customInstructions,
        ),
      ),
    );

    // 7. Embed all extracted nodes (batch)
    const allExtractedNodes = extractedNodesPerEpisode.flat();
    const allEmbedded =
      await this.embeddingService.embedNodes(allExtractedNodes);
    const embeddedPerEpisode = reassembleByOffsets(
      allEmbedded,
      extractedNodesPerEpisode.map((a) => a.length),
    );

    // 8. Get all existing nodes once
    const groupIds = [...new Set(episodes.map((e) => e.groupId))];
    const existingNodes =
      await this.entityNodeRepository.getByGroupIds(groupIds);
    const existingNodesMap = new Map(existingNodes.map((n) => [n.uuid, n]));

    // 9. Pass 1 — resolve nodes vs live graph in parallel
    const nodeResolutions = await Promise.all(
      embeddedPerEpisode.map((nodes, i) =>
        this.nodeResolutionService.resolveNodes(
          model,
          episodicNodes[i],
          nodes,
          existingNodes,
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

    // 11. Pass 2 — within-batch cosine similarity dedup
    const allNewNodes = nodeResolutions.flatMap((r) => r.resolvedNodes);
    const pass2Pairs: [string, string][] = [];
    for (let i = 0; i < allNewNodes.length; i++) {
      for (let j = i + 1; j < allNewNodes.length; j++) {
        const a = allNewNodes[i];
        const b = allNewNodes[j];
        if (
          a.nameEmbedding &&
          b.nameEmbedding &&
          cosineSimilarity(a.nameEmbedding, b.nameEmbedding) >=
            COSINE_SIMILARITY_THRESHOLD
        ) {
          pass2Pairs.push([a.uuid, b.uuid]);
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

    // 13. Extract edges in parallel, then resolve pointers
    const extractedEdgesPerEpisode = await Promise.all(
      episodicNodes.map((ep, i) =>
        this.edgeExtractionService.extractEdges(
          model,
          ep,
          canonicalNodesPerEpisode[i],
          prevEpisodesPerEpisode[i],
          ep.validAt,
          customInstructions,
        ),
      ),
    );

    const pointedEdgesPerEpisode = extractedEdgesPerEpisode.map((edges) =>
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

    // 15. Get all existing edges once
    const existingEdges =
      await this.entityEdgeRepository.getByGroupIds(groupIds);

    // 16. Resolve edges in parallel
    const edgeResolutions = await Promise.all(
      episodicNodes.map((ep, i) =>
        this.edgeResolutionService.resolveEdges(
          model,
          ep,
          embeddedEdgesPerEpisode[i],
          existingEdges,
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

    // 17. Generate node summaries for all new canonical nodes
    const allCanonicalNodes = [
      ...new Map(
        canonicalNodesPerEpisode.flat().map((n) => [n.uuid, n]),
      ).values(),
    ];
    const newNodesOnly = allCanonicalNodes.filter(
      (n) => !existingNodesMap.has(n.uuid),
    );

    if (newNodesOnly.length > 0) {
      // Use the first episode as context for the summary prompt (best effort)
      const summaryMessages = buildNodeSummaryMessages({
        episode: episodicNodes[0],
        previousEpisodes: prevEpisodesPerEpisode[0],
        nodes: newNodesOnly.map((n) => ({
          uuid: n.uuid,
          name: n.name,
          summary: n.summary,
          facts: allResolvedEdges
            .filter(
              (e) => e.sourceNodeUuid === n.uuid || e.targetNodeUuid === n.uuid,
            )
            .map((e) => e.fact),
        })),
      });

      const summaryResult = await model
        .withStructuredOutput(nodeSummaryJsonSchema)
        .invoke(summaryMessages);

      const summaryMap = new Map(
        summaryResult.summaries.map((s: { uuid: string; summary: string }) => [
          s.uuid,
          s.summary,
        ]),
      );

      for (const node of newNodesOnly) {
        const summary = summaryMap.get(node.uuid);
        if (summary !== undefined) node.summary = summary;
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
    ]);

    // 20. Optional community build
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
      episodicEdges: allEpisodicEdges,
    };
  }
}
