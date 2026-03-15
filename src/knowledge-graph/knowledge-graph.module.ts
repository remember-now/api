import { Module } from '@nestjs/common';

import { EmbeddingConfigModule } from '@/config/embedding';

import { EmbeddingService } from './embedding';
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
  imports: [Neo4jModule, EmbeddingConfigModule],
  providers: [
    ...repositories,
    ...extractionServices,
    EmbeddingService,
    ...resolutionServices,
  ],
  exports: [
    ...repositories,
    ...extractionServices,
    EmbeddingService,
    ...resolutionServices,
  ],
})
export class KnowledgeGraphModule {}
