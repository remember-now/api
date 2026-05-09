import {
  CommunityNode,
  createCommunityNode,
  createEntityNode,
  createEpisodicNode,
  createSagaNode,
  EntityNode,
  EpisodeType,
  EpisodicNode,
  SagaNode,
} from '@/knowledge-graph/models';
import {
  NodeLabelSchema,
  NodeLabelsSchema,
  NodeNameSchema,
} from '@/knowledge-graph/neo4j';

import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID } from './kg-constants';

type WithStrings<T> = Omit<Partial<T>, 'name' | 'labels'> & {
  name?: string;
  labels?: string[];
};

export class KgNodeFactory {
  static createEntityNode(opts: WithStrings<EntityNode> = {}): EntityNode {
    const { name, labels, ...rest } = opts;
    return createEntityNode({
      name: NodeNameSchema.parse(name ?? 'TestEntity'),
      labels: labels
        ? NodeLabelsSchema.parse(labels)
        : [NodeLabelSchema.parse('Entity')],
      groupId: KG_TEST_GROUP_ID,
      ...rest,
    });
  }

  static createEpisodicNode(
    opts: WithStrings<EpisodicNode> = {},
  ): EpisodicNode {
    const { name, labels, ...rest } = opts;
    return createEpisodicNode({
      name: NodeNameSchema.parse(name ?? 'Test Episode'),
      groupId: KG_TEST_GROUP_ID,
      content: 'test content',
      validAt: KG_REFERENCE_TIME,
      source: EpisodeType.text,
      labels: labels
        ? NodeLabelsSchema.parse(labels)
        : [NodeLabelSchema.parse('Episodic')],
      ...rest,
    });
  }

  static createCommunityNode(
    opts: WithStrings<CommunityNode> = {},
  ): CommunityNode {
    const { name, labels, ...rest } = opts;
    return createCommunityNode({
      name: NodeNameSchema.parse(name ?? 'Test Community'),
      groupId: KG_TEST_GROUP_ID,
      labels: labels
        ? NodeLabelsSchema.parse(labels)
        : [NodeLabelSchema.parse('Community')],
      ...rest,
    });
  }

  static createSagaNode(opts: WithStrings<SagaNode> = {}): SagaNode {
    const { name, labels, ...rest } = opts;
    return createSagaNode({
      name: NodeNameSchema.parse(name ?? 'Test Saga'),
      groupId: KG_TEST_GROUP_ID,
      labels: labels
        ? NodeLabelsSchema.parse(labels)
        : [NodeLabelSchema.parse('Saga')],
      ...rest,
    });
  }
}
