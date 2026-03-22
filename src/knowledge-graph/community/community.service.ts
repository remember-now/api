import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { LlmService } from '@/llm/llm.service';

import { EmbeddingService } from '../embedding';
import { createCommunityEdge } from '../models/edges/community-edge';
import { createCommunityNode } from '../models/nodes/community-node';
import { Neo4jService } from '../neo4j/neo4j.service';
import {
  CommunityEdgeRepository,
  CommunityNodeRepository,
  EntityNodeRepository,
} from '../neo4j/repositories';
import { buildCommunitySummaryMessages } from './community-summary.prompts';

export const CommunitySummarySchema = z.object({
  name: z.string(),
  summary: z.string(),
});

export const communitySummaryJsonSchema = z.toJSONSchema(
  CommunitySummarySchema,
);

@Injectable()
export class CommunityService {
  constructor(
    private readonly llmService: LlmService,
    private readonly embeddingService: EmbeddingService,
    private readonly neo4jService: Neo4jService,
    private readonly entityNodeRepository: EntityNodeRepository,
    private readonly communityNodeRepository: CommunityNodeRepository,
    private readonly communityEdgeRepository: CommunityEdgeRepository,
  ) {}

  async buildCommunities(userId: number, groupId: string): Promise<void> {
    // 1. Guard: check if any Entity nodes with RELATES_TO edges exist
    const guardResult = await this.neo4jService.executeRead<{
      hasEdges: boolean;
    }>(
      /* cypher */ `MATCH (n:Entity {group_id: $groupId})-[:RELATES_TO]-() RETURN count(n) > 0 AS hasEdges`,
      { groupId },
    );

    if (!guardResult[0]?.hasEdges) {
      await this.communityNodeRepository.deleteByGroupId(groupId);
      return;
    }

    // 2. Get active model
    const model = await this.llmService.getActiveModel(userId);

    // 3. Project GDS graph
    const graphName = `community-${randomUUID()}`;
    await this.neo4jService.executeWrite(
      /* cypher */ `MATCH (source:Entity {group_id: $groupId})-[r:RELATES_TO]-(target:Entity {group_id: $groupId})
       WITH gds.graph.project($graphName, source, target) AS g
       RETURN g.graphName, g.nodeCount, g.relationshipCount`,
      { groupId, graphName },
    );

    let communityMap!: Map<number, string[]>;

    try {
      // 4. Run Leiden
      const leidenResults = await this.neo4jService.executeRead<{
        uuid: string;
        communityId: number;
      }>(
        /* cypher */ `CALL gds.leiden.stream($graphName, { randomSeed: 42 })
         YIELD nodeId, communityId
         RETURN gds.util.asNode(nodeId).uuid AS uuid, communityId`,
        { graphName },
      );

      // 6. Group entity UUIDs by communityId
      communityMap = new Map<number, string[]>();
      for (const row of leidenResults) {
        const existing = communityMap.get(row.communityId) ?? [];
        existing.push(row.uuid);
        communityMap.set(row.communityId, existing);
      }
    } finally {
      // 5. Drop projection (always)
      await this.neo4jService.executeWrite(
        /* cypher */ `CALL gds.graph.drop($graphName, false)`,
        { graphName },
      );
    }

    // 7. Delete old communities for this group
    await this.communityNodeRepository.deleteByGroupId(groupId);

    // 8. For each community, generate LLM summary
    const communityNodes = [];
    const communityEdges = [];

    for (const [, memberUuids] of communityMap) {
      const memberNodes =
        await this.entityNodeRepository.getByUuids(memberUuids);

      const messages = buildCommunitySummaryMessages({ nodes: memberNodes });

      const communitySummary = await model
        .withStructuredOutput(communitySummaryJsonSchema)
        .invoke(messages);

      const communityRaw = createCommunityNode({
        name: communitySummary.name,
        summary: communitySummary.summary,
        groupId,
      });
      const nameEmbedding = await this.embeddingService.embedText(
        communityRaw.name,
      );
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
  }
}
