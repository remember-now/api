import { randomUUID } from 'node:crypto';

import {
  CommunityEdge,
  createCommunityEdge,
} from '@/knowledge-graph/models/edges/community-edge';
import {
  createEntityEdge,
  EntityEdge,
} from '@/knowledge-graph/models/edges/entity-edge';
import {
  createEpisodicEdge,
  EpisodicEdge,
} from '@/knowledge-graph/models/edges/episodic-edge';
import {
  createHasEpisodeEdge,
  HasEpisodeEdge,
} from '@/knowledge-graph/models/edges/has-episode-edge';
import {
  createNextEpisodeEdge,
  NextEpisodeEdge,
} from '@/knowledge-graph/models/edges/next-episode-edge';

import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID } from './kg-constants';

export class KgEdgeFactory {
  static createEntityEdge(opts: Partial<EntityEdge> = {}): EntityEdge {
    return createEntityEdge({
      name: 'related_to',
      fact: 'A is related to B',
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: randomUUID(),
      targetNodeUuid: randomUUID(),
      validAt: KG_REFERENCE_TIME,
      ...opts,
    });
  }

  static createEpisodicEdge(opts: Partial<EpisodicEdge> = {}): EpisodicEdge {
    return createEpisodicEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: randomUUID(),
      targetNodeUuid: randomUUID(),
      ...opts,
    });
  }

  static createHasEpisodeEdge(
    opts: Partial<HasEpisodeEdge> = {},
  ): HasEpisodeEdge {
    return createHasEpisodeEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: randomUUID(),
      targetNodeUuid: randomUUID(),
      ...opts,
    });
  }

  static createNextEpisodeEdge(
    opts: Partial<NextEpisodeEdge> = {},
  ): NextEpisodeEdge {
    return createNextEpisodeEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: randomUUID(),
      targetNodeUuid: randomUUID(),
      ...opts,
    });
  }

  static createCommunityEdge(opts: Partial<CommunityEdge> = {}): CommunityEdge {
    return createCommunityEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: randomUUID(),
      targetNodeUuid: randomUUID(),
      ...opts,
    });
  }
}
