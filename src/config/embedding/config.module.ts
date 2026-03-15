import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EmbeddingConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [ConfigModule.forFeature(configuration)],
  providers: [EmbeddingConfigService],
  exports: [EmbeddingConfigService],
})
export class EmbeddingConfigModule {}
