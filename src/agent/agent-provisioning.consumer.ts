import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { AgentService } from './agent.service';
import { CreateAgentJobData, DeleteAgentJobData } from './types';
import { QueueNames } from 'src/common/constants';

@Processor(QueueNames.AGENT_PROVISIONING)
export class AgentProvisioningConsumer extends WorkerHost {
  private readonly logger = new Logger(AgentProvisioningConsumer.name);

  constructor(private readonly agentService: AgentService) {
    super();
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
      await this.agentService.createAgentAndLinkToUser(userId);
      this.logger.log(`Successfully created agent for user ${userId}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Skipping agent creation for user ${userId} - user no longer exists`,
        );
        return;
      }
      this.logger.error(`Failed to create agent for user ${userId}:`, error);
      throw error;
    }
  }

  private async handleDeleteAgent(job: Job<DeleteAgentJobData>): Promise<void> {
    const { userId, agentId } = job.data;

    try {
      await this.agentService.deleteAgentById(agentId, userId);
      this.logger.log(
        `Successfully deleted agent ${agentId} for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete agent ${agentId} for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
