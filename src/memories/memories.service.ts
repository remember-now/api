import { APIError } from '@letta-ai/letta-client';
import type { BlockUpdateParams } from '@letta-ai/letta-client/resources/agents/blocks';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AgentService } from '@/agent/agent.service';
import { LettaService } from '@/letta';

import { CreateMemoryBlockDto, UpdateMemoryBlockDto } from './dto';

/**
 * Handles memory block operations for user agents
 */
@Injectable()
export class MemoriesService {
  private readonly logger = new Logger(MemoriesService.name);

  constructor(
    private readonly client: LettaService,
    private readonly agentService: AgentService,
  ) {}

  async listMemoryBlocks(userId: number) {
    try {
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
      const agentId = await this.agentService.getOrCreateAgentForUser(userId);

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
