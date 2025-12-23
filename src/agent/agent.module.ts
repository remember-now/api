import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AgentProvisioningConsumer } from './agent-provisioning.consumer';
import { LettaModule } from '@/letta/letta.module';
import { UserModule } from '@/user/user.module';
import { QueueNames } from '@/common/constants';

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
