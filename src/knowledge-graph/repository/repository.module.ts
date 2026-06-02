import { Module } from '@nestjs/common';

import {
  CommunityRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  SagaNodeRepository,
} from './repositories';

const repositories = [
  CommunityRepository,
  EntityNodeRepository,
  EntityEdgeRepository,
  EpisodicNodeRepository,
  EpisodicEdgeRepository,
  SagaNodeRepository,
  HasEpisodeEdgeRepository,
];

// PrismaModule is @Global() - no explicit import needed.
@Module({
  providers: repositories,
  exports: repositories,
})
export class RepositoryModule {}
