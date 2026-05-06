import { randomUUID } from 'node:crypto';

import {
  CommunityEdge,
  createCommunityEdge,
  createEntityEdge,
  createEpisodicEdge,
  createHasEpisodeEdge,
  createNextEpisodeEdge,
  EntityEdge,
  EpisodicEdge,
  HasEpisodeEdge,
  NextEpisodeEdge,
} from '@/knowledge-graph/models';

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
