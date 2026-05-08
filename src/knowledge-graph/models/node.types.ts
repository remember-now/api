import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  EpisodeType,
  GroupId,
  GroupIdSchema,
  NodeLabelsSchema,
  Uuid,
  UuidSchema,
} from '../neo4j/neo4j.schemas';

// Schemas

export const NodeBaseSchema = z.object({
  uuid: UuidSchema,
  name: z.string().min(1),
  groupId: GroupIdSchema,
  labels: NodeLabelsSchema,
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
  partial: Partial<EntityNode> & { name: string; groupId: GroupId },
): EntityNode {
  return {
    ...createNodeDefaults(),
    labels: ['Entity'],
    nameEmbedding: null,
    summary: '',
    attributes: {},
    ...partial,
  };
}

export function createEpisodicNode(
  partial: Partial<EpisodicNode> & {
    name: string;
    groupId: GroupId;
    content: string;
    validAt: Date;
  },
): EpisodicNode {
  return {
    ...createNodeDefaults(),
    labels: ['Episodic'],
    source: EpisodeType.text,
    sourceDescription: '',
    entityEdges: [] as Uuid[],
    ...partial,
  };
}

export function createCommunityNode(
  partial: Partial<CommunityNode> & { name: string; groupId: GroupId },
): CommunityNode {
  return {
    ...createNodeDefaults(),
    labels: ['Community'],
    nameEmbedding: null,
    summary: '',
    ...partial,
  };
}

export function createSagaNode(
  partial: Partial<SagaNode> & { name: string; groupId: GroupId },
): SagaNode {
  return {
    ...createNodeDefaults(),
    labels: ['Saga'],
    summary: '',
    lastSummarizedAt: null,
    ...partial,
  };
}
