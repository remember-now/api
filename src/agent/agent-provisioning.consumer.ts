import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { QueueNames } from '@/common/constants';

import { AgentService } from './agent.service';
import { CreateAgentJobData, DeleteAgentJobData } from './types';

@Processor(QueueNames.AGENT_PROVISIONING)
export class AgentProvisioningConsumer
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(AgentProvisioningConsumer.name);
  private readonly isTest =
    process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

  constructor(
    private readonly agentService: AgentService,
    @InjectQueue(QueueNames.AGENT_PROVISIONING)
    private readonly queue: Queue,
  ) {
    super();
  }

  /**
   * Check if error is a pool closure error during test teardown.
   * These are expected when force closing workers in tests.
   */
  private isTestTeardownError(error: unknown): boolean {
    return (
      this.isTest &&
      error instanceof Error &&
      error.message?.includes('Cannot use a pool after calling end')
    );
  }

  async onModuleDestroy() {
    if (!this.worker) return;

    const forceClose = this.isTest;

    await this.worker.close(forceClose);

    if (!this.queue.closing) {
      await this.queue.close();
    }
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
      await this.agentService.deleteAgentById(agentId, userId);
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
