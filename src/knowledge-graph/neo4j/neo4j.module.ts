import { Module } from '@nestjs/common';

import { Neo4jConfigModule } from '@/config/neo4j';

import { EmbeddingModule } from '../embedding/embedding.module';
import { Neo4jService } from './neo4j.service';
import {
  CommunityEdgeRepository,
  CommunityNodeRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  GdsCommunityRepository,
  HasEpisodeEdgeRepository,
  NextEpisodeEdgeRepository,
  SagaNodeRepository,
} from './repositories';

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
  GdsCommunityRepository,
];

@Module({
  imports: [Neo4jConfigModule, EmbeddingModule],
  providers: [Neo4jService, ...repositories],
  exports: [Neo4jService, ...repositories],
})
export class Neo4jModule {}
