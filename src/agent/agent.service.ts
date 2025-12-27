import { APIError } from '@letta-ai/letta-client';
import type { AgentType } from '@letta-ai/letta-client/resources/agents/agents';
import type { BlockUpdateParams } from '@letta-ai/letta-client/resources/agents/blocks';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LettaService } from '@/letta';
import { UserService } from '@/user/user.service';

import {
  ChatRequestDto,
  CreateMemoryBlockDto,
  GetMessagesQueryDto,
  UpdateMemoryBlockDto,
} from './dto';
import * as AGENT_CONFIG from './templates/agent-config.json';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

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

  async createAgentAndLinkToUser(userId: number): Promise<string> {
    const agent = await this.createDefaultAgent();

    try {
      await this.userService.updateUserAgentId(userId, agent.id);
      return agent.id;
    } catch (error) {
      await this.cleanupOrphanedAgent(agent.id);
      throw error;
    }
  }

  async getOrCreateUserAgent(userId: number): Promise<string> {
    const user = await this.userService.getUserById(userId);
    if (user.agentId) {
      return user.agentId;
    }

    try {
      return await this.createAgentAndLinkToUser(userId);
    } catch (error) {
      this.logger.error('Failed to create agent for user', error);
      throw new InternalServerErrorException('Failed to create user agent');
    }
  }

  async getMessages(dto: GetMessagesQueryDto, userId: number) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      const messagesPage = await this.client.agents.messages.list(agentId, {
        limit: dto.limit,
        before: dto.before,
      });

      return {
        messages: messagesPage.items,
        params: {
          limit: dto.limit,
          before: dto.before,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get agent messages', error);

      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Agent not found');
      }
      throw new InternalServerErrorException('Failed to get agent messages');
    }
  }

  async sendMessage(dto: ChatRequestDto, userId: number) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      const response = await this.client.agents.messages.create(agentId, {
        messages: [
          {
            role: 'user',
            content: dto.message,
          },
        ],
      });

      return {
        response: response.messages || 'I received your message.',
        usage: response.usage,
      };
    } catch (error) {
      this.logger.error('Failed to send message to agent', error);

      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Agent not found');
      }
      throw new InternalServerErrorException(
        'Failed to communicate with agent',
      );
    }
  }

  async sendMessageStream(dto: ChatRequestDto, userId: number) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      const stream = await this.client.agents.messages.stream(agentId, {
        messages: [
          {
            role: 'user',
            content: dto.message,
          },
        ],
        stream_tokens: true,
      });

      return stream;
    } catch (error) {
      this.logger.error('Failed to create message stream', error);

      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Agent not found');
      }
      throw new InternalServerErrorException(
        'Failed to communicate with agent',
      );
    }
  }

  async getAgentInfo(userId: number) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);
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

  async deleteAgentById(agentId: string, userId?: number): Promise<void> {
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

  async listMemoryBlocks(userId: number) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      const blocksPage = await this.client.agents.blocks.list(agentId);
      return blocksPage.items;
    } catch (error) {
      this.logger.error('Failed to list memory blocks', error);

      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Agent not found');
      }
      throw new InternalServerErrorException('Failed to list memory blocks');
    }
  }

  async getMemoryBlock(userId: number, blockLabel: string) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      return await this.client.agents.blocks.retrieve(blockLabel, {
        agent_id: agentId,
      });
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Memory block not found');
      }
      this.logger.error(`Failed to get memory block ${blockLabel}`, error);
      throw new InternalServerErrorException('Failed to get memory block');
    }
  }

  async createMemoryBlock(userId: number, dto: CreateMemoryBlockDto) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      const block = await this.client.blocks.create({
        label: dto.label,
        value: dto.value,
        description: dto.description,
        limit: dto.limit,
        read_only: dto.readOnly,
      });
      if (!block.id) {
        throw new InternalServerErrorException(
          'Failed to create block for - no ID returned',
        );
      }
      await this.client.agents.blocks.attach(block.id, {
        agent_id: agentId,
      });

      return block;
    } catch (error) {
      this.logger.error('Failed to create memory block', error);

      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Agent not found');
      }
      throw new InternalServerErrorException('Failed to create memory block');
    }
  }

  async updateMemoryBlock(
    userId: number,
    blockLabel: string,
    dto: UpdateMemoryBlockDto,
  ) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      const updatePayload: BlockUpdateParams = {
        agent_id: agentId,
      };
      if (dto.value !== undefined) updatePayload.value = dto.value;
      if (dto.description !== undefined)
        updatePayload.description = dto.description;
      if (dto.limit !== undefined) updatePayload.limit = dto.limit;
      if (dto.readOnly !== undefined) updatePayload.read_only = dto.readOnly;

      return await this.client.agents.blocks.update(blockLabel, updatePayload);
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Memory block not found');
      }
      this.logger.error(`Failed to update memory block ${blockLabel}`, error);
      throw new InternalServerErrorException('Failed to update memory block');
    }
  }

  async deleteMemoryBlock(userId: number, blockLabel: string) {
    try {
      const agentId = await this.getOrCreateUserAgent(userId);

      const block = await this.client.agents.blocks.retrieve(blockLabel, {
        agent_id: agentId,
      });
      if (block.id) {
        await this.client.agents.blocks.detach(block.id, {
          agent_id: agentId,
        });
      }
      return {
        message: 'Memory block deleted successfully',
        blockLabel: blockLabel,
        userId: userId,
      };
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        throw new NotFoundException('Memory block not found');
      }
      this.logger.error(`Failed to delete memory block ${blockLabel}`, error);
      throw new InternalServerErrorException('Failed to delete memory block');
    }
  }
}
