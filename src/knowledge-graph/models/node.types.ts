import { randomUUID } from 'node:crypto';

import { z } from 'zod';

// Schemas

export enum EpisodeType {
  message = 'message',
  json = 'json',
  text = 'text',
  factTriple = 'fact_triple',
}

export const NodeBaseSchema = z.object({
  uuid: z.uuid(),
  name: z.string().min(1),
  groupId: z.string().min(1),
  labels: z.array(z.string()),
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
  entityEdges: z.array(z.string()),
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
    uuid: randomUUID(),
    labels: [],
    createdAt: new Date(),
  };
}

export function createEntityNode(
  partial: Partial<EntityNode> & { name: string; groupId: string },
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
    groupId: string;
    content: string;
    validAt: Date;
  },
): EpisodicNode {
  return {
    ...createNodeDefaults(),
    labels: ['Episodic'],
    source: EpisodeType.text,
    sourceDescription: '',
    entityEdges: [],
    ...partial,
  };
}

export function createCommunityNode(
  partial: Partial<CommunityNode> & { name: string; groupId: string },
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
  partial: Partial<SagaNode> & { name: string; groupId: string },
): SagaNode {
  return {
    ...createNodeDefaults(),
    labels: ['Saga'],
    summary: '',
    lastSummarizedAt: null,
    ...partial,
  };
}
