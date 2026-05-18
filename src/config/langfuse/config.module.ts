import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LangfuseConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [ConfigModule.forFeature(configuration)],
  providers: [LangfuseConfigService],
  exports: [LangfuseConfigService],
})
export class LangfuseConfigModule {}
