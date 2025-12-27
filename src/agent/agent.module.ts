import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { LettaModule } from '@/providers/agent/letta';
import { QueueNames } from '@/providers/queue/bullmq';
import { UserModule } from '@/user/user.module';

import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import {
  AgentProviderService,
  AgentProvisioningConsumer,
} from './provisioning';

@Module({
  imports: [
    LettaModule,
    UserModule,
    BullModule.registerQueue({
      name: QueueNames.AGENT_PROVISIONING,
    }),
  ],
  providers: [AgentService, AgentProviderService, AgentProvisioningConsumer],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
