import { APIError } from '@letta-ai/letta-client';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AgentService } from '@/agent/agent.service';
import { LettaService } from '@/letta';

import { ChatRequestDto, GetMessagesQueryDto } from './dto';

/**
 * Handles message/chat operations for user agents
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly client: LettaService,
    private readonly agentService: AgentService,
  ) {}

  async getMessages(dto: GetMessagesQueryDto, userId: number) {
    try {
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
}
