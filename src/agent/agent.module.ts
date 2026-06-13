import { Module } from '@nestjs/common';

import { KnowledgeGraphModule } from '@/knowledge-graph/knowledge-graph.module';
import { LlmModule } from '@/llm/llm.module';
import { UserModule } from '@/user/user.module';

import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [UserModule, KnowledgeGraphModule, LlmModule],
  providers: [AgentService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
