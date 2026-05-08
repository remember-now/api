import { Module } from '@nestjs/common';

import { LlmModule } from '@/llm/llm.module';

import { CommunityModule } from '../community/community.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { Neo4jModule } from '../neo4j/neo4j.module';
import { ResolutionModule } from '../resolution/resolution.module';
import { BulkEpisodeService } from './bulk-episode.service';

@Module({
  imports: [
    LlmModule,
    EmbeddingModule,
    ExtractionModule,
    ResolutionModule,
    CommunityModule,
    Neo4jModule,
  ],
  providers: [BulkEpisodeService],
  exports: [BulkEpisodeService],
})
export class BulkModule {}
