import { Module } from '@nestjs/common';

import { LlmModule } from '@/llm/llm.module';

import { CommunityModule } from '../community/community.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { RepositoryModule } from '../repository/repository.module';
import { SearchService } from './search.service';

@Module({
  imports: [LlmModule, EmbeddingModule, RepositoryModule, CommunityModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
