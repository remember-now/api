import { Module } from '@nestjs/common';

import { LlmModule } from '@/llm/llm.module';

import { EmbeddingModule } from '../embedding/embedding.module';
import { Neo4jModule } from '../neo4j/neo4j.module';
import { CommunityService } from './community.service';

@Module({
  imports: [LlmModule, EmbeddingModule, Neo4jModule],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
