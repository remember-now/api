import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  EpisodeType,
  GroupId,
  GroupIdSchema,
  NodeLabelSchema,
  NodeName,
  NodeNameSchema,
  Uuid,
  UuidSchema,
} from '../neo4j/neo4j.schemas';

// Schemas

export const NodeBaseSchema = z.object({
  uuid: UuidSchema,
  name: NodeNameSchema,
  groupId: GroupIdSchema,
  labels: z.array(NodeLabelSchema),
  createdAt: z.date(),
});

export const EntityNodeSchema = NodeBaseSchema.extend({
  nameEmbedding: z.array(z.number()).nullable(),
  summary: z.string(),
  attributes: z.record(z.string(), z.unknown()),
});

export const EpisodicNodeSchema = NodeBaseSchema.extend({
  source: z.enum(EpisodeType),
  sourceDescription: z.string(),
  content: z.string(),
  validAt: z.date(),
  entityEdges: z.array(UuidSchema),
});

export const CommunityNodeSchema = NodeBaseSchema.extend({
  nameEmbedding: z.array(z.number()).nullable(),
  summary: z.string(),
});

export const SagaNodeSchema = NodeBaseSchema.extend({
  summary: z.string(),
  lastSummarizedAt: z.date().nullable(),
});

// Types

export type NodeBase = z.infer<typeof NodeBaseSchema>;
export type EntityNode = z.infer<typeof EntityNodeSchema>;
export type EpisodicNode = z.infer<typeof EpisodicNodeSchema>;
export type CommunityNode = z.infer<typeof CommunityNodeSchema>;
export type SagaNode = z.infer<typeof SagaNodeSchema>;

// Factories

export function createNodeDefaults(): Omit<NodeBase, 'name' | 'groupId'> {
  return {
    uuid: UuidSchema.parse(randomUUID()),
    labels: [],
    createdAt: new Date(),
  };
}

export function createEntityNode(
  partial: Partial<EntityNode> & { name: NodeName; groupId: GroupId },
): EntityNode {
  return {
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Entity')],
    nameEmbedding: null,
    summary: '',
    attributes: {},
    ...partial,
  };
}

export function createEpisodicNode(
  partial: Partial<EpisodicNode> & {
    name: NodeName;
    groupId: GroupId;
    content: string;
    validAt: Date;
  },
): EpisodicNode {
  return {
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Episodic')],
    source: EpisodeType.text,
    sourceDescription: '',
    entityEdges: [] as Uuid[],
    ...partial,
  };
}

export function createCommunityNode(
  partial: Partial<CommunityNode> & { name: NodeName; groupId: GroupId },
): CommunityNode {
  return {
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Community')],
    nameEmbedding: null,
    summary: '',
    ...partial,
  };
}

export function createSagaNode(
  partial: Partial<SagaNode> & { name: NodeName; groupId: GroupId },
): SagaNode {
  return {
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Saga')],
    summary: '',
    lastSummarizedAt: null,
    ...partial,
  };
}
