import { WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Abstract base class for BullMQ queue consumers with test-aware cleanup.
 * Provides:
 * - Automatic logger initialization
 * - Graceful shutdown with worker cleanup
 * - Test teardown error detection method to avoid logging noise
 */
export abstract class BaseQueueConsumer
  extends WorkerHost
  implements OnModuleDestroy
{
  protected readonly logger: Logger;
  protected readonly isTest =
    process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

  constructor(
    loggerContext: string,
    protected readonly queue: Queue,
  ) {
    super();
    this.logger = new Logger(loggerContext);
  }

  /**
   * Check if error is a pool closure error during test teardown.
   * Use this to avoid logging expected test teardown errors.
   */
  protected isTestTeardownError(error: unknown): boolean {
    return (
      this.isTest &&
      error instanceof Error &&
      error.message?.includes('Cannot use a pool after calling end')
    );
  }

  async onModuleDestroy() {
    if (!this.worker) return;

    await this.worker.close(this.isTest);

    if (!this.queue.closing) {
      await this.queue.close();
    }
  }
}
