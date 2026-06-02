import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

import { Span } from '@/observability';
import { BaseQueueConsumer } from '@/providers/queue/bullmq/base-queue-consumer';

import { LLM_CONCURRENCY_LIMIT } from '../../batch-utils';
import { CommunityService } from '../community.service';
import {
  COMMUNITY_UPDATE_QUEUE,
  type CommunityUpdateJobData,
} from './community-update.queue';

/**
 * Worker-level fan-out across jobs. updateCommunityForEntity uses a single
 * row-locked UPDATE for member_ids, so concurrent touches of the same
 * community serialize on the row - no global cap needed. Bounded by the
 * shared LLM concurrency limit since each entity costs ~2 LLM calls + an
 * embed.
 */
@Processor(COMMUNITY_UPDATE_QUEUE, { concurrency: LLM_CONCURRENCY_LIMIT })
export class CommunityUpdateConsumer extends BaseQueueConsumer {
  constructor(
    @InjectQueue(COMMUNITY_UPDATE_QUEUE) queue: Queue<CommunityUpdateJobData>,
    private readonly communityService: CommunityService,
  ) {
    super(CommunityUpdateConsumer.name, queue);
  }

  @Span('community-update', { asLangfuseTrace: true })
  async process(job: Job<CommunityUpdateJobData>): Promise<void> {
    const { userId, graphId, entityIds } = job.data;
    try {
      // Sequential within a job: cheap throttle so a single oversized job
      // doesn't burst past the worker's share of LLM capacity. Cross-job
      // parallelism comes from the @Processor concurrency above.
      // TODO: isolate per-entity failures. A throw here aborts the rest of the
      // batch and BullMQ retries the whole job - one poison entity blocks its
      // siblings until the retry budget is exhausted. Wrap each call in
      // try/catch + emit a failed-entity metric so good entities still update.
      for (const entityId of entityIds) {
        await this.communityService.updateCommunityForEntity(userId, graphId, entityId, {
          userId,
          tags: ['knowledge-graph', 'community-update', `graph:${graphId}`],
          metadata: { trigger: 'episode', jobId: job.id ?? '' },
        });
      }
    } catch (err) {
      if (this.isTestTeardownError(err)) return;
      this.logger.error(`Community update failed for graph ${graphId}`, err);
      throw err;
    }
  }
}
