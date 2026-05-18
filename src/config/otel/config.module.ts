import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OtelConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [ConfigModule.forFeature(configuration)],
  providers: [OtelConfigService],
  exports: [OtelConfigService],
})
export class OtelConfigModule {}
