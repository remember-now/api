import { Module } from '@nestjs/common';

import { Neo4jModule } from '../neo4j/neo4j.module';
import { EdgeResolutionService } from './edge-resolution.service';
import { NodeResolutionService } from './node-resolution.service';

@Module({
  imports: [Neo4jModule],
  providers: [NodeResolutionService, EdgeResolutionService],
  exports: [NodeResolutionService, EdgeResolutionService],
})
export class ResolutionModule {}
