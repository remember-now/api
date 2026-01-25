import { Module } from '@nestjs/common';

import { AgentModule } from '@/agent/agent.module';

import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';

@Module({
  imports: [AgentModule],
  providers: [MemoriesService],
  controllers: [MemoriesController],
})
export class MemoriesModule {}
