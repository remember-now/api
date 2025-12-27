import type { AgentType } from '@letta-ai/letta-client/resources/agents/agents';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LettaService } from '@/providers/agent/letta';
import { UserService } from '@/user/user.service';

import * as AGENT_CONFIG from '../templates/agent-config.json';

/**
 * Manages agent lifecycle - creation, retrieval, and linking to users.
 * Orchestrates between the Letta backend and user management.
 */
@Injectable()
export class AgentProviderService {
  private readonly logger = new Logger(AgentProviderService.name);

  constructor(
    private readonly client: LettaService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  private async createDefaultAgent() {
    return await this.client.agents.create({
      agent_type: AGENT_CONFIG.agent_type as AgentType,
      memory_blocks: AGENT_CONFIG.memory_blocks,
      model: this.configService.get<string>(
        'MODEL',
        'google_ai/gemini-2.5-pro',
      ),
      embedding: this.configService.get<string>(
        'EMBEDDING',
        'google_ai/text-embedding-004',
      ),
    });
  }

  private async cleanupOrphanedAgent(agentId: string): Promise<void> {
    try {
      await this.client.agents.delete(agentId);
      this.logger.warn(
        `Cleaned up orphaned agent ${agentId} after database update failure`,
      );
    } catch (cleanupError: unknown) {
      const errorMessage =
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError);

      this.logger.error('Failed to cleanup orphaned agent', {
        agentId,
        error: errorMessage,
      });
    }
  }

  async createAgentForUser(userId: number): Promise<string> {
    const agent = await this.createDefaultAgent();

    try {
      await this.userService.updateUserAgentId(userId, agent.id);
      return agent.id;
    } catch (error) {
      await this.cleanupOrphanedAgent(agent.id);
      throw error;
    }
  }

  async getOrCreateAgentForUser(userId: number): Promise<string> {
    const user = await this.userService.getUserById(userId);
    if (user.agentId) {
      return user.agentId;
    }

    try {
      return await this.createAgentForUser(userId);
    } catch (error) {
      this.logger.error('Failed to create agent for user', error);
      throw new InternalServerErrorException('Failed to create user agent');
    }
  }

  async deleteAgent(agentId: string, userId?: number): Promise<void> {
    await this.deleteAgentFromLetta(agentId);
    if (userId) {
      await this.clearUserAgentId(userId);
    }
  }

  private async deleteAgentFromLetta(agentId: string): Promise<void> {
    try {
      await this.client.agents.delete(agentId);
    } catch (error) {
      this.logger.error('Failed to delete agent from Letta', error);
      throw new InternalServerErrorException('Failed to delete agent');
    }
  }

  private async clearUserAgentId(userId: number): Promise<void> {
    try {
      await this.userService.updateUserAgentId(userId, null);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.debug(
          `User ${userId} no longer exists, skipping agentId update`,
        );
        return;
      }
      this.logger.error(
        `Could not update user ${userId} agentId to null`,
        error,
      );
    }
  }
}
