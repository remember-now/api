import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CommunityConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [ConfigModule.forFeature(configuration)],
  providers: [CommunityConfigService],
  exports: [CommunityConfigService],
})
export class CommunityConfigModule {}
