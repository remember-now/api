import { Module } from '@nestjs/common';

import { EmbeddingConfigModule } from '@/config/embedding';
import { LlmModule } from '@/llm/llm.module';

import { BulkEpisodeService } from './bulk';
import { CommunityService } from './community';
import { EmbeddingService } from './embedding';
import { EpisodeService } from './episode';
import { EdgeExtractionService, NodeExtractionService } from './extraction';
import { Neo4jModule } from './neo4j/neo4j.module';
import {
  CommunityEdgeRepository,
  CommunityNodeRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  NextEpisodeEdgeRepository,
  SagaNodeRepository,
} from './neo4j/repositories';
import { EdgeResolutionService, NodeResolutionService } from './resolution';
import { SearchService } from './search';

const repositories = [
  EntityNodeRepository,
  EpisodicNodeRepository,
  CommunityNodeRepository,
  SagaNodeRepository,
  EntityEdgeRepository,
  EpisodicEdgeRepository,
  CommunityEdgeRepository,
  HasEpisodeEdgeRepository,
  NextEpisodeEdgeRepository,
];

const extractionServices = [NodeExtractionService, EdgeExtractionService];

const resolutionServices = [NodeResolutionService, EdgeResolutionService];

@Module({
  imports: [Neo4jModule, EmbeddingConfigModule, LlmModule],
  providers: [
    ...repositories,
    ...extractionServices,
    EmbeddingService,
    ...resolutionServices,
    EpisodeService,
    CommunityService,
    SearchService,
    BulkEpisodeService,
  ],
  exports: [
    ...repositories,
    ...extractionServices,
    EmbeddingService,
    ...resolutionServices,
    EpisodeService,
    CommunityService,
    SearchService,
    BulkEpisodeService,
  ],
})
export class KnowledgeGraphModule {}
