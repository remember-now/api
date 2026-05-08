import { Module } from '@nestjs/common';

import { BulkModule } from './bulk/bulk.module';
import { CommunityModule } from './community/community.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { EpisodeModule } from './episode/episode.module';
import { ExtractionModule } from './extraction/extraction.module';
import { Neo4jModule } from './neo4j/neo4j.module';
import { ResolutionModule } from './resolution/resolution.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    EmbeddingModule,
    Neo4jModule,
    ExtractionModule,
    ResolutionModule,
    CommunityModule,
    SearchModule,
    EpisodeModule,
    BulkModule,
  ],
  exports: [
    EmbeddingModule,
    Neo4jModule,
    ExtractionModule,
    ResolutionModule,
    CommunityModule,
    SearchModule,
    EpisodeModule,
    BulkModule,
  ],
})
export class KnowledgeGraphModule {}
