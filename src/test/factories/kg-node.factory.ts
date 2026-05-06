import {
  CommunityNode,
  createCommunityNode,
} from '@/knowledge-graph/models/nodes/community-node';
import {
  createEntityNode,
  EntityNode,
} from '@/knowledge-graph/models/nodes/entity-node';
import {
  createEpisodicNode,
  EpisodicNode,
} from '@/knowledge-graph/models/nodes/episodic-node';
import { EpisodeType } from '@/knowledge-graph/models/nodes/node.types';
import {
  createSagaNode,
  SagaNode,
} from '@/knowledge-graph/models/nodes/saga-node';

import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID } from './kg-constants';

export class KgNodeFactory {
  static createEntityNode(opts: Partial<EntityNode> = {}): EntityNode {
    return createEntityNode({
      name: 'TestEntity',
      groupId: KG_TEST_GROUP_ID,
      ...opts,
    });
  }

  static createEpisodicNode(opts: Partial<EpisodicNode> = {}): EpisodicNode {
    return createEpisodicNode({
      name: 'Test Episode',
      groupId: KG_TEST_GROUP_ID,
      content: 'test content',
      validAt: KG_REFERENCE_TIME,
      source: EpisodeType.text,
      labels: ['Episodic'],
      ...opts,
    });
  }

  static createCommunityNode(opts: Partial<CommunityNode> = {}): CommunityNode {
    return createCommunityNode({
      name: 'Test Community',
      groupId: KG_TEST_GROUP_ID,
      labels: ['Community'],
      ...opts,
    });
  }

  static createSagaNode(opts: Partial<SagaNode> = {}): SagaNode {
    return createSagaNode({
      name: 'Test Saga',
      groupId: KG_TEST_GROUP_ID,
      labels: ['Saga'],
      ...opts,
    });
  }
}
