import { Module } from '@nestjs/common';

import { UserModule } from '@/user/user.module';

import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [UserModule],
  providers: [AgentService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
