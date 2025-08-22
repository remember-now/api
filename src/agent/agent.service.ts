import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { LettaService } from 'src/letta';
import { UserService } from 'src/user/user.service';
import { ChatRequestDto } from './dto';
import { LettaError } from '@letta-ai/letta-client';
import type { AssistantMessage } from '@letta-ai/letta-client/api/types';
import { ConfigService } from '@nestjs/config';

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
      agentType: 'memgpt_v2_agent',
      memoryBlocks: [
        {
          label: 'human',
          value: `The user wants an assistant that remembers everything for them so they never have to remember anything again. They want the lasting sense of peace that comes from knowing that no piece of useful knowledge shared with me is lost.`,
        },
        {
          label: 'persona',
          value:
            "I am an assistant that helps users by remembering everything for them. I remind them of important things, help them find information they've shared before, and act as their augmented memory companion. I am proactive in helping them remember things they might need.",
        },
      ],
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
      const assistantMessages = response.messages
        .filter(
          (msg): msg is AssistantMessage =>
            msg.messageType === 'assistant_message',
        )
        .map((msg) => msg.content as string)
        .join(' ');

      return {
        response: assistantMessages || 'I received your message.',
        usage: response.usage,
      };
    } catch (error) {
      this.logger.error('Failed to send message to agent', error);

      if (error instanceof LettaError && error.statusCode === 404) {
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

      const stream = await this.client.agents.messages.createStream(agentId, {
        messages: [
          {
            role: 'user',
            content: dto.message,
          },
        ],
        streamTokens: true,
      });

      return stream;
    } catch (error) {
      this.logger.error('Failed to create message stream', error);

      if (error instanceof LettaError && error.statusCode === 404) {
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
        llmConfig: agent.llmConfig,
        created: agent.createdAt,
      };
    } catch (error) {
      this.logger.error('Failed to get agent info', error);

      if (error instanceof LettaError && error.statusCode === 404) {
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
}
