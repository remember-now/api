import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { Neo4jConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [ConfigModule.forFeature(configuration)],
  providers: [Neo4jConfigService],
  exports: [Neo4jConfigService],
})
export class Neo4jConfigModule {}
