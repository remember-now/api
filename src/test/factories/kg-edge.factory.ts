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
import { RelationshipTypeSchema } from '@/knowledge-graph/neo4j';

import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID, kgUuid } from './kg-constants';

type WithStringName<T> = Omit<Partial<T>, 'name'> & { name?: string };

export class KgEdgeFactory {
  static createEntityEdge(opts: WithStringName<EntityEdge> = {}): EntityEdge {
    const { name, ...rest } = opts;
    return createEntityEdge({
      name: RelationshipTypeSchema.parse(name ?? 'RELATED_TO'),
      fact: 'A is related to B',
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: kgUuid(),
      targetNodeUuid: kgUuid(),
      validAt: KG_REFERENCE_TIME,
      ...rest,
    });
  }

  static createEpisodicEdge(opts: Partial<EpisodicEdge> = {}): EpisodicEdge {
    return createEpisodicEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: kgUuid(),
      targetNodeUuid: kgUuid(),
      ...opts,
    });
  }

  static createHasEpisodeEdge(opts: Partial<HasEpisodeEdge> = {}): HasEpisodeEdge {
    return createHasEpisodeEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: kgUuid(),
      targetNodeUuid: kgUuid(),
      ...opts,
    });
  }

  static createNextEpisodeEdge(opts: Partial<NextEpisodeEdge> = {}): NextEpisodeEdge {
    return createNextEpisodeEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: kgUuid(),
      targetNodeUuid: kgUuid(),
      ...opts,
    });
  }

  static createCommunityEdge(opts: Partial<CommunityEdge> = {}): CommunityEdge {
    return createCommunityEdge({
      groupId: KG_TEST_GROUP_ID,
      sourceNodeUuid: kgUuid(),
      targetNodeUuid: kgUuid(),
      ...opts,
    });
  }
}
