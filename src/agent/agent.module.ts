import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QueueNames } from '@/common/constants';
import { LettaModule } from '@/letta/letta.module';
import { UserModule } from '@/user/user.module';

import { AgentProvisioningConsumer } from './agent-provisioning.consumer';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [
    LettaModule,
    UserModule,
    BullModule.registerQueue({
      name: QueueNames.AGENT_PROVISIONING,
    }),
  ],
  providers: [AgentService, AgentProvisioningConsumer],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
