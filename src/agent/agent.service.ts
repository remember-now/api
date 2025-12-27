import { APIError } from '@letta-ai/letta-client';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { LettaService } from '@/providers/agent/letta';

import { AgentProviderService } from './provisioning';

/**
 * Public facade for agent operations.
 * Exposes agent configuration and lifecycle methods to other modules.
 * Internal provisioning details are encapsulated in AgentProviderService.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly client: LettaService,
    private readonly agentProvider: AgentProviderService,
  ) {}

  async getOrCreateAgentForUser(userId: number): Promise<string> {
    return this.agentProvider.getOrCreateAgentForUser(userId);
  }

  async getAgentInfo(userId: number) {
    try {
      const agentId = await this.getOrCreateAgentForUser(userId);
      const agent = await this.client.agents.retrieve(agentId);

      return {
        id: agent.id,
        name: agent.name,
        modelSettings: agent.model_settings,
        created: agent.created_at,
      };
    } catch (error) {
      this.logger.error('Failed to get agent info', error);

      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Agent not found');
      }
      throw new InternalServerErrorException(
        'Failed to retrieve agent information',
      );
    }
  }
}
