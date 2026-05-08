import { Module } from '@nestjs/common';

import { EmbeddingConfigModule } from '@/config/embedding';

import { EmbeddingService } from './embedding.service';

@Module({
  imports: [EmbeddingConfigModule],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
