import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { Uuid } from '@/common/schemas';
import { Span } from '@/observability';
import { QueueNames } from '@/providers/queue/bullmq/queue.constants';

export const COMMUNITY_REBUILD_QUEUE = QueueNames.CommunityRebuild;
export const COMMUNITY_REBUILD_JOB = 'rebuild';

export interface CommunityRebuildJobData {
  userId: Uuid;
  graphId: Uuid;
}

@Injectable()
export class CommunityRebuildQueueService {
  constructor(
    @InjectQueue(COMMUNITY_REBUILD_QUEUE)
    private readonly queue: Queue<CommunityRebuildJobData>,
  ) {}

  /**
   * Schedule a debounced full rebuild for a graph. BullMQ debounce-mode
   * deduplication (`id` = graphId, `extend` + `replace`, `delay == ttl`) gives a
   * sliding window: every ingestion within the window pushes execution out and
   * keeps only the latest job, so N episodes for one graph coalesce into a
   * single rebuild firing `debounceMs` after the last one. The payload is stable
   * per graph, so `replace` is a no-op on data.
   */
  @Span()
  async enqueue(data: CommunityRebuildJobData, debounceMs: number): Promise<void> {
    await this.queue.add(COMMUNITY_REBUILD_JOB, data, {
      deduplication: { id: data.graphId, ttl: debounceMs, extend: true, replace: true },
      delay: debounceMs,
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    });
  }
}
