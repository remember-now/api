import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QueueNames } from '@/common/constants';
import { LettaModule } from '@/letta/letta.module';
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
