import { randomUUID } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { Uuid } from '@/common/schemas';
import { LlmService } from '@/llm/llm.service';
import { LLM_TRACER, type LlmContext, type LlmTracer, Span } from '@/observability';

import { EmbeddingService } from '../embedding';
import { createCommunityEdge, createCommunityNode } from '../models';
import {
  CommunityEdgeRepository,
  CommunityNodeRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  GdsCommunityRepository,
} from '../neo4j/repositories';
import { GraphNameSchema, GroupId, NodeNameSchema } from '../neo4j/types';
import { buildCommunitySummaryMessages } from '../prompts';

type SpanMetrics = Record<string, string | number | boolean | undefined>;
const metricsOnResult = (r: unknown) => ({
  attributes: (r as { metrics: SpanMetrics }).metrics,
});

export const CommunitySummarySchema = z.object({
  name: NodeNameSchema,
  summary: z.string(),
});

export const communitySummaryJsonSchema = z.toJSONSchema(CommunitySummarySchema);

@Injectable()
export class CommunityService {
  constructor(
    private readonly llmService: LlmService,
    private readonly embeddingService: EmbeddingService,
    private readonly entityEdgeRepository: EntityEdgeRepository,
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly communityNodeRepository: CommunityNodeRepository,
    private readonly communityEdgeRepository: CommunityEdgeRepository,
    private readonly gdsCommunityRepository: GdsCommunityRepository,
    @Inject(LLM_TRACER) private readonly llmTracer: LlmTracer,
  ) {}

  async buildCommunities(userId: Uuid, groupId: GroupId): Promise<void> {
    await this.buildCommunitiesImpl(userId, groupId);
  }

  @Span('buildCommunities', { onResult: metricsOnResult })
  private async buildCommunitiesImpl(
    userId: Uuid,
    groupId: GroupId,
  ): Promise<{ metrics: SpanMetrics }> {
    const ctx: LlmContext = {
      userId,
      sessionId: userId,
      tags: ['knowledge-graph', 'community'],
      metadata: { groupId },
    };

    const baseMetrics: SpanMetrics = {
      'user.id': userId,
      'group.id': groupId,
    };

    // 1. Guard: check if any Entity nodes with RELATES_TO edges exist
    const hasEdges = await this.entityEdgeRepository.hasRelatesEdgesForGroup(groupId);

    if (!hasEdges) {
      await this.communityNodeRepository.deleteByGroupId(groupId);
      return { metrics: { ...baseMetrics, 'communities.count': 0 } };
    }

    // 2. Get active model
    const model = await this.llmService.getActiveModel(userId);

    // 3. Project GDS graph
    const graphName = GraphNameSchema.parse(`community-${randomUUID()}`);
    await this.gdsCommunityRepository.projectGraph(graphName, groupId);

    let communityMap!: Map<number, Uuid[]>;

    try {
      // 4. Run Leiden
      const leidenResults = await this.gdsCommunityRepository.runLeiden(graphName);

      // 5. Group entity UUIDs by communityId
      communityMap = new Map<number, Uuid[]>();
      for (const row of leidenResults) {
        const existing = communityMap.get(row.communityId) ?? [];
        existing.push(row.uuid);
        communityMap.set(row.communityId, existing);
      }
    } finally {
      // 6. Drop projection (always)
      await this.gdsCommunityRepository.dropGraph(graphName);
    }

    // 7. Delete old communities for this group
    // NOTE: Communities are deleted before new ones are persisted. If LLM summary
    // generation (step 8) throws, the group will have no communities until the next
    // successful buildCommunities call. Adding rollback support would require staging
    // new communities before deleting the old ones.
    await this.communityNodeRepository.deleteByGroupId(groupId);

    // 8. For each community, generate LLM summary
    const communityNodes = [];
    const communityEdges = [];

    // TODO(#992): executes one getByUuids query per community instead of a single
    // batched query. On large graphs with many communities this may be slow.
    // https://github.com/getzep/graphiti/issues/992
    for (const [, memberUuids] of communityMap) {
      const memberNodes = await this.entityNodeRepository.getByUuids(memberUuids);

      const messages = buildCommunitySummaryMessages({ nodes: memberNodes });

      const communitySummary = await model
        .withStructuredOutput(communitySummaryJsonSchema)
        .invoke(messages, {
          callbacks: this.llmTracer.getCallbacks(ctx),
          runName: 'community-summary',
          tags: ['knowledge-graph', 'community.summary'],
        });

      const communityRaw = createCommunityNode({
        name: communitySummary.name,
        summary: communitySummary.summary,
        groupId,
      });
      const nameEmbedding = await this.embeddingService.embedText(communityRaw.name);
      const community = { ...communityRaw, nameEmbedding };
      communityNodes.push(community);

      const edges = memberUuids.map((uuid) =>
        createCommunityEdge({
          sourceNodeUuid: community.uuid,
          targetNodeUuid: uuid,
          groupId,
        }),
      );
      communityEdges.push(...edges);
    }

    // 9. Persist nodes first, then edges (edges require community nodes to exist)
    await this.communityNodeRepository.saveBulk(communityNodes);
    await this.communityEdgeRepository.saveBulk(communityEdges);

    return {
      metrics: {
        ...baseMetrics,
        'communities.count': communityNodes.length,
        'communities.edges.count': communityEdges.length,
      },
    };
  }
}
