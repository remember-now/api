import { Injectable } from '@nestjs/common';

import { LlmService } from '@/llm/llm.service';

import { chunkContent, shouldChunk } from '../bulk/content-chunking';
import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import {
  createEpisodicEdge,
  createHasEpisodeEdge,
  createNextEpisodeEdge,
} from '../models/edges';
import {
  createEpisodicNode,
  createSagaNode,
  EpisodeType,
  EpisodicNode,
} from '../models/nodes';
import { validateGroupId } from '../neo4j/neo4j-label-validation';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  NextEpisodeEdgeRepository,
  SagaNodeRepository,
} from '../neo4j/repositories';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import {
  AddEpisodeOptions,
  AddEpisodeResult,
  nodeSummaryJsonSchema,
} from './episode.types';
import { buildNodeSummaryMessages } from './node-summary.prompts';

const PREVIOUS_EPISODES_WINDOW = 20;
const MAX_NODES_PER_SUMMARY_BATCH = 30;

@Injectable()
export class EpisodeService {
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
    private readonly sagaNodeRepository: SagaNodeRepository,
    private readonly hasEpisodeEdgeRepository: HasEpisodeEdgeRepository,
    private readonly nextEpisodeEdgeRepository: NextEpisodeEdgeRepository,
  ) {}

  async getEpisodes(options: {
    groupIds: string[];
    referenceTime?: Date;
    lastN?: number;
    source?: EpisodeType;
    sagaUuid?: string;
  }): Promise<EpisodicNode[]> {
    const {
      groupIds,
      referenceTime = new Date(),
      lastN = 10,
      source,
      sagaUuid,
    } = options;
    return this.episodicNodeRepository.retrieveEpisodes(
      referenceTime,
      lastN,
      groupIds,
      source,
      sagaUuid,
    );
  }

  async deleteEpisode(uuid: string): Promise<void> {
    const episode = await this.episodicNodeRepository.getByUuid(uuid);
    if (!episode) return;

    // Load entity nodes mentioned by this episode
    const mentionedNodeUuids =
      await this.episodicNodeRepository.getMentionedEntityUuids(uuid);

    // Delete entity nodes that are only mentioned by this episode
    await Promise.all(
      mentionedNodeUuids.map((nodeUuid) =>
        this.entityNodeRepository.deleteIfSoleMentioned(nodeUuid),
      ),
    );

    // Load and delete entity edges first created by this episode
    const edgeUuids =
      await this.entityEdgeRepository.getUuidsForEpisodeDeletion(uuid);
    if (edgeUuids.length > 0) {
      await this.entityEdgeRepository.deleteByUuids(edgeUuids);
    }

    // Delete MENTIONS edges for this episode
    await this.episodicEdgeRepository.deleteBySourceUuid(uuid);

    // Delete episode node
    await this.episodicNodeRepository.delete(uuid);
  }

  // TODO: For very large batches a bulk Cypher variant would be preferred over
  // sequential per-episode deletion.
  async deleteEpisodesByUuid(uuids: string[]): Promise<void> {
    await Promise.all(uuids.map((uuid) => this.deleteEpisode(uuid)));
  }

  async addEpisode(options: AddEpisodeOptions): Promise<AddEpisodeResult> {
    const {
      userId,
      name,
      content,
      source = EpisodeType.text,
      sourceDescription = '',
      groupId,
      referenceTime = new Date(),
      sagaUuid,
      entityTypes,
      customInstructions,
    } = options;

    validateGroupId(groupId);

    // 1. Get active model
    const model = await this.llmService.getActiveModel(userId);

    // 2. Retrieve previous episodes
    const previousEpisodes = await this.episodicNodeRepository.retrieveEpisodes(
      referenceTime,
      PREVIOUS_EPISODES_WINDOW,
      [groupId],
    );

    // 3. Create + save episode
    const episode = createEpisodicNode({
      name,
      content,
      source,
      sourceDescription,
      groupId,
      validAt: referenceTime,
    });
    await this.episodicNodeRepository.save(episode);

    // 4. Extract nodes
    // TODO: When shouldChunk(content), split into chunks via chunkContent() and
    // run extraction per chunk, then merge results. The episode node is saved once;
    // only extraction runs per chunk.
    if (shouldChunk(content)) {
      const _chunks = chunkContent(content, source);
      void _chunks; // chunked extraction not yet implemented — fall through to full-content extraction
    }
    const extractedNodes = await this.nodeExtractionService.extractNodes(
      model,
      episode,
      previousEpisodes,
      entityTypes,
      customInstructions,
    );

    // 5. Get existing nodes + embed extracted nodes in parallel
    // TODO: scalability — loads ALL entity nodes into memory. For large graphs this
    // should be replaced with a candidate pre-filter (e.g., vector index or BFS).
    const [existingNodes, embeddedNodes] = await Promise.all([
      this.entityNodeRepository.getByGroupIds([groupId]),
      this.embeddingService.embedNodes(extractedNodes),
    ]);

    // 6. Resolve nodes
    const { resolvedNodes, uuidMap } =
      await this.nodeResolutionService.resolveNodes(
        model,
        episode,
        embeddedNodes,
        existingNodes,
        previousEpisodes,
        customInstructions,
      );

    const matchedExistingNodes = existingNodes.filter((n) =>
      [...uuidMap.values()].includes(n.uuid),
    );
    const canonicalNodes = [...resolvedNodes, ...matchedExistingNodes];

    // 7. Extract edges
    const extractedEdges = await this.edgeExtractionService.extractEdges(
      model,
      episode,
      canonicalNodes,
      previousEpisodes,
      referenceTime,
      customInstructions,
    );

    // 8. Get existing edges + embed extracted edges in parallel
    const [existingEdges, embeddedEdges] = await Promise.all([
      this.entityEdgeRepository.getByGroupIds([groupId]),
      this.embeddingService.embedEdges(extractedEdges),
    ]);

    // 9. Resolve edges
    const { resolvedEdges, invalidatedEdges } =
      await this.edgeResolutionService.resolveEdges(
        model,
        episode,
        embeddedEdges,
        existingEdges,
        uuidMap,
        referenceTime,
        previousEpisodes,
        customInstructions,
      );

    // 10. Generate node summaries for newly resolved nodes
    if (resolvedNodes.length > 0) {
      const nodeSummaryInput = resolvedNodes.map((n) => ({
        uuid: n.uuid,
        name: n.name,
        summary: n.summary,
        facts: resolvedEdges
          .filter(
            (e) => e.sourceNodeUuid === n.uuid || e.targetNodeUuid === n.uuid,
          )
          .map((e) => e.fact),
      }));

      const summaryMap = new Map<string, string>();
      for (
        let i = 0;
        i < nodeSummaryInput.length;
        i += MAX_NODES_PER_SUMMARY_BATCH
      ) {
        const batch = nodeSummaryInput.slice(
          i,
          i + MAX_NODES_PER_SUMMARY_BATCH,
        );
        const summaryMessages = buildNodeSummaryMessages({
          episode,
          previousEpisodes,
          nodes: batch,
        });

        const summaryResult = await model
          .withStructuredOutput(nodeSummaryJsonSchema)
          .invoke(summaryMessages);

        for (const s of summaryResult.summaries) {
          summaryMap.set(s.uuid, s.summary);
        }
      }

      for (const node of resolvedNodes) {
        const summary = summaryMap.get(node.uuid);
        if (summary !== undefined) {
          node.summary = summary;
        }
      }
    }

    // 11. Build episodic edges
    const episodicEdges = canonicalNodes.map((n) =>
      createEpisodicEdge({
        sourceNodeUuid: episode.uuid,
        targetNodeUuid: n.uuid,
        groupId,
      }),
    );

    // 12. Persist all in parallel
    await Promise.all([
      this.entityNodeRepository.saveBulk(resolvedNodes),
      this.entityEdgeRepository.saveBulk(resolvedEdges),
      this.entityEdgeRepository.saveBulk(invalidatedEdges),
      this.episodicEdgeRepository.saveBulk(episodicEdges),
    ]);

    // 13. Saga association
    if (sagaUuid) {
      await this.sagaNodeRepository.save(
        createSagaNode({ uuid: sagaUuid, name: sagaUuid, groupId }),
      );
      await this.hasEpisodeEdgeRepository.save(
        createHasEpisodeEdge({
          sourceNodeUuid: sagaUuid,
          targetNodeUuid: episode.uuid,
          groupId,
        }),
      );

      const [prevEpisode] = await this.episodicNodeRepository.retrieveEpisodes(
        referenceTime,
        1,
        undefined,
        undefined,
        sagaUuid,
      );
      if (prevEpisode && prevEpisode.uuid !== episode.uuid) {
        await this.nextEpisodeEdgeRepository.save(
          createNextEpisodeEdge({
            sourceNodeUuid: prevEpisode.uuid,
            targetNodeUuid: episode.uuid,
            groupId,
          }),
        );
      }
    }

    // 14. Build communities (opt-in)
    if (options.updateCommunities) {
      await this.communityService.buildCommunities(userId, groupId);
    }

    return {
      episode,
      nodes: resolvedNodes,
      edges: resolvedEdges,
      invalidatedEdges,
      episodicEdges,
    };
  }
}
