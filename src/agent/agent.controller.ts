import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { GetUser } from '@/auth/decorator';
import { LoggedInGuard } from '@/auth/guard';
import { EpisodeService } from '@/knowledge-graph/episode';
import { EpisodeType } from '@/knowledge-graph/models';
import { GroupIdSchema } from '@/knowledge-graph/neo4j/neo4j.schemas';
import { SearchService } from '@/knowledge-graph/search';
import {
  EdgeReranker,
  EdgeSearchMethod,
  NodeReranker,
  NodeSearchMethod,
} from '@/knowledge-graph/search/search-config.types';

import { AgentService } from './agent.service';

// TODO: REMOVE — test DTOs
const TestIngestSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  groupId: GroupIdSchema,
  source: z.enum(EpisodeType).optional(),
});
class TestIngestDto extends createZodDto(TestIngestSchema) {}

// TODO: REMOVE — test DTOs
const TestSearchSchema = z.object({
  query: z.string().min(1),
  groupId: GroupIdSchema,
});
class TestSearchDto extends createZodDto(TestSearchSchema) {}

@ApiTags('Agent')
@Controller('agent')
@UseGuards(LoggedInGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly episodeService: EpisodeService, // TODO: REMOVE
    private readonly searchService: SearchService, // TODO: REMOVE
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get agent information and configuration' })
  getAgentInfo(@GetUser('id') userId: number) {
    return this.agentService.getAgentInfo(userId);
  }

  // TODO: REMOVE
  @Post('test/ingest')
  @ApiOperation({
    summary: '[TEST] Ingest an episode into the knowledge graph',
  })
  async testIngest(@Body() body: TestIngestDto, @GetUser('id') userId: number) {
    const result = await this.episodeService.addEpisode({
      userId,
      name: body.name,
      content: body.content,
      groupId: body.groupId,
      source: body.source,
    });

    return {
      episodeUuid: result.episode.uuid,
      nodes: result.nodes.map((n) => ({
        uuid: n.uuid,
        name: n.name,
        summary: n.summary,
        labels: n.labels,
      })),
      edges: result.edges.map((e) => ({
        uuid: e.uuid,
        name: e.name,
        fact: e.fact,
        validAt: e.validAt?.toISOString() ?? null,
        invalidAt: e.invalidAt?.toISOString() ?? null,
      })),
      invalidatedEdgeCount: result.invalidatedEdges.length,
    };
  }

  // TODO: REMOVE
  @Post('test/search')
  @ApiOperation({ summary: '[TEST] Search the knowledge graph' })
  async testSearch(@Body() body: TestSearchDto, @GetUser('id') userId: number) {
    const results = await this.searchService.search({
      userId,
      query: body.query,
      groupIds: [body.groupId],
      config: {
        limit: 10,
        edgeConfig: {
          searchMethods: [
            EdgeSearchMethod.bm25,
            EdgeSearchMethod.cosine_similarity,
          ],
          reranker: EdgeReranker.rrf,
        },
        nodeConfig: {
          searchMethods: [
            NodeSearchMethod.bm25,
            NodeSearchMethod.cosine_similarity,
          ],
          reranker: NodeReranker.rrf,
        },
      },
    });

    return {
      edges: results.edges.map((e) => ({
        uuid: e.uuid,
        name: e.name,
        fact: e.fact,
        score: results.edgeScores.get(e.uuid) ?? 0,
        validAt: e.validAt?.toISOString() ?? null,
        invalidAt: e.invalidAt?.toISOString() ?? null,
      })),
      nodes: results.nodes.map((n) => ({
        uuid: n.uuid,
        name: n.name,
        summary: n.summary,
        score: results.nodeScores.get(n.uuid) ?? 0,
      })),
      episodes: results.episodes.map((ep) => ({
        uuid: ep.uuid,
        content: ep.content,
        validAt: ep.validAt?.toISOString() ?? null,
        score: results.episodeScores.get(ep.uuid) ?? 0,
      })),
    };
  }
}
