import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [ConfigModule.forFeature(configuration)],
  providers: [RedisConfigService],
  exports: [RedisConfigService],
})
export class RedisConfigModule {}
