import { Injectable } from '@nestjs/common';

import { LlmService } from '@/llm/llm.service';

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
} from '../models/nodes';
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
  NodeSummarySchema,
} from './episode.types';
import { buildNodeSummaryMessages } from './node-summary.prompts';

const PREVIOUS_EPISODES_WINDOW = 5;

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
    const extractedNodes = await this.nodeExtractionService.extractNodes(
      model,
      episode,
      previousEpisodes,
      entityTypes,
      customInstructions,
    );

    // 5. Get existing nodes + embed extracted nodes in parallel
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

      const summaryMessages = buildNodeSummaryMessages({
        episode,
        previousEpisodes,
        nodes: nodeSummaryInput,
      });

      const summaryResult = await model
        .withStructuredOutput(nodeSummaryJsonSchema)
        .invoke(summaryMessages);

      const parsed = NodeSummarySchema.safeParse(summaryResult);
      if (parsed.success) {
        const summaryMap = new Map(
          parsed.data.summaries.map((s) => [s.uuid, s.summary]),
        );
        for (const node of resolvedNodes) {
          const summary = summaryMap.get(node.uuid);
          if (summary !== undefined) {
            node.summary = summary;
          }
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

    // 14. Build communities
    await this.communityService.buildCommunities(userId, groupId);

    return {
      episode,
      nodes: resolvedNodes,
      edges: resolvedEdges,
      episodicEdges,
    };
  }
}
