import { Module } from '@nestjs/common';

import { AgentModule } from '@/agent/agent.module';
import { LettaModule } from '@/letta/letta.module';

import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [AgentModule, LettaModule],
  providers: [MessagesService],
  controllers: [MessagesController],
})
export class MessagesModule {}
