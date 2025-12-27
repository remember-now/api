import { InjectQueue, Processor } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { BaseQueueConsumer } from '@/common/base-queue-consumer';
import { QueueNames } from '@/common/constants';

import { CreateAgentJobData, DeleteAgentJobData } from '../types';
import { AgentProviderService } from './agent-provider.service';

@Processor(QueueNames.AGENT_PROVISIONING)
export class AgentProvisioningConsumer extends BaseQueueConsumer {
  constructor(
    private readonly agentProvider: AgentProviderService,
    @InjectQueue(QueueNames.AGENT_PROVISIONING) queue: Queue,
  ) {
    super(AgentProvisioningConsumer.name, queue);
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`Processing job ${job.name} with data:`, job.data);

    switch (job.name) {
      case 'create-agent':
        await this.handleCreateAgent(job as Job<CreateAgentJobData>);
        break;
      case 'delete-agent':
        await this.handleDeleteAgent(job as Job<DeleteAgentJobData>);
        break;
      default:
        this.logger.error(`Unknown job name: ${job.name}`);
    }
  }

  private async handleCreateAgent(job: Job<CreateAgentJobData>): Promise<void> {
    const { userId } = job.data;

    try {
      await this.agentProvider.createAgentForUser(userId);
      this.logger.log(`Successfully created agent for user ${userId}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Skipping agent creation for user ${userId} - user no longer exists`,
        );
        return;
      }
      if (this.isTestTeardownError(error)) {
        return;
      }
      this.logger.error(`Failed to create agent for user ${userId}:`, error);
      throw error;
    }
  }

  private async handleDeleteAgent(job: Job<DeleteAgentJobData>): Promise<void> {
    const { userId, agentId } = job.data;

    try {
      await this.agentProvider.deleteAgent(agentId, userId);
      this.logger.log(
        `Successfully deleted agent ${agentId} for user ${userId}`,
      );
    } catch (error) {
      if (this.isTestTeardownError(error)) {
        return;
      }
      this.logger.error(
        `Failed to delete agent ${agentId} for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
