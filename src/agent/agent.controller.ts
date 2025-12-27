import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { GetUser } from '@/auth/decorator';
import { LoggedInGuard } from '@/auth/guard';

import { AgentService } from './agent.service';

@ApiTags('Agent')
@Controller('agent')
@UseGuards(LoggedInGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  @ApiOperation({ summary: 'Get agent information and configuration' })
  getAgentInfo(@GetUser('id') userId: number) {
    return this.agentService.getAgentInfo(userId);
  }
}
