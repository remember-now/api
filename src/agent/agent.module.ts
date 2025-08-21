import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { LettaModule } from 'src/letta/letta.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [LettaModule, UserModule],
  providers: [AgentService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
