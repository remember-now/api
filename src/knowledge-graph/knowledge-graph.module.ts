import { Module } from '@nestjs/common';

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

@Module({
  imports: [Neo4jModule],
  providers: [...repositories, ...extractionServices],
  exports: [...repositories, ...extractionServices],
})
export class KnowledgeGraphModule {}
