import { Module } from '@nestjs/common';

import { Neo4jConfigModule } from '@/config/neo4j';

import { Neo4jService } from './neo4j.service';

@Module({
  imports: [Neo4jConfigModule],
  providers: [Neo4jService],
  exports: [Neo4jService],
})
export class Neo4jModule {}
