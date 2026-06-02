import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { Uuid } from '@/common/schemas';
import { Span } from '@/observability';
import { QueueNames } from '@/providers/queue/bullmq/queue.constants';

export const COMMUNITY_UPDATE_QUEUE = QueueNames.CommunityUpdate;
export const COMMUNITY_UPDATE_JOB = 'update';

export interface CommunityUpdateJobData {
  userId: Uuid;
  graphId: Uuid;
  entityIds: Uuid[];
}

@Injectable()
export class CommunityUpdateQueueService {
  constructor(
    @InjectQueue(COMMUNITY_UPDATE_QUEUE)
    private readonly queue: Queue<CommunityUpdateJobData>,
  ) {}

  /**
   * One job per (episode call, graphId), carrying the canonical entity ids it
   * resolved. The consumer can fan out across jobs; the per-community race on
   * `member_ids` is handled by an atomic row-locked UPDATE in the repo, not by
   * worker serialization.
   */
  @Span()
  async enqueue(data: CommunityUpdateJobData): Promise<void> {
    if (data.entityIds.length === 0) return;
    await this.queue.add(COMMUNITY_UPDATE_JOB, data, {
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    });
  }
}
