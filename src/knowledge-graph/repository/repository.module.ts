import { Module } from '@nestjs/common';

import {
  CommunityEdgeRepository,
  CommunityNodeRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  GdsCommunityRepository,
  HasEpisodeEdgeRepository,
  SagaNodeRepository,
} from './repositories';

const repositories = [
  CommunityNodeRepository,
  CommunityEdgeRepository,
  GdsCommunityRepository,
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
