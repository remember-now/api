import { Module } from '@nestjs/common';

import { CommunityModule } from './community/community.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { EpisodeModule } from './episode/episode.module';
import { ExtractionModule } from './extraction/extraction.module';
import { RepositoryModule } from './repository/repository.module';
import { ResolutionModule } from './resolution/resolution.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    EmbeddingModule,
    RepositoryModule,
    ExtractionModule,
    ResolutionModule,
    CommunityModule,
    SearchModule,
    EpisodeModule,
  ],
  exports: [
    EmbeddingModule,
    RepositoryModule,
    ExtractionModule,
    ResolutionModule,
    CommunityModule,
    SearchModule,
    EpisodeModule,
  ],
})
export class KnowledgeGraphModule {}
