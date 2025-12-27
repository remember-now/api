import { Module } from '@nestjs/common';

import { AgentModule } from '@/agent/agent.module';
import { LettaModule } from '@/providers/agent/letta';

import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';

@Module({
  imports: [AgentModule, LettaModule],
  providers: [MemoriesService],
  controllers: [MemoriesController],
})
export class MemoriesModule {}
