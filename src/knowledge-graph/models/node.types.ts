import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { Uuid, UuidSchema } from '@/common/schemas';

import { EpisodeType, NodeLabelSchema, NodeName, NodeNameSchema } from '../types';

// Schemas

export const NodeBaseSchema = z.object({
  uuid: UuidSchema,
  name: NodeNameSchema,
  graphId: UuidSchema,
  labels: z.array(NodeLabelSchema),
  createdAt: z.date(),
});

export const EntityNodeSchema = NodeBaseSchema.extend({
  nameEmbedding: z.array(z.number()).nullable().default(null),
  summary: z.string().default(''),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const EpisodicNodeSchema = NodeBaseSchema.extend({
  source: z.enum(EpisodeType),
  sourceDescription: z.string().default(''),
  content: z.string(),
  validAt: z.date(),
  // entityEdges omitted: upstream's Neo4j denormalization of "facts this
  // episode contributed to" lives on `entity_edges.episodes` here. For the
  // upstream semantic, query `EntityEdge WHERE thisEpisode = ANY(episodes)`.

  // episodeMetadata omitted: upstream declares a "customer-defined metadata
  // for filtering" field but never writes or reads it. Add only if a
  // concrete filterable-metadata requirement materializes.
});

export const CommunityNodeSchema = NodeBaseSchema.extend({
  nameEmbedding: z.array(z.number()).nullable().default(null),
  summary: z.string().default(''),
});

export const SagaNodeSchema = NodeBaseSchema.extend({
  summary: z.string().default(''),
  lastSummarizedAt: z.date().nullable().default(null),
  // firstEpisodeUuid / lastEpisodeUuid omitted: upstream persists them but
  // never reads either. The queries they'd optimize (start/end of saga) are
  // cheap via HAS_EPISODE + ORDER BY valid_at.
});

// Types

export type NodeBase = z.infer<typeof NodeBaseSchema>;
export type EntityNode = z.infer<typeof EntityNodeSchema>;
export type EpisodicNode = z.infer<typeof EpisodicNodeSchema>;
export type CommunityNode = z.infer<typeof CommunityNodeSchema>;
export type SagaNode = z.infer<typeof SagaNodeSchema>;

// Factories

export function createNodeDefaults(): Omit<NodeBase, 'name' | 'graphId'> {
  return {
    uuid: UuidSchema.parse(randomUUID()),
    labels: [],
    createdAt: new Date(),
  };
}

export function createEntityNode(
  partial: Partial<EntityNode> & { name: NodeName; graphId: Uuid },
): EntityNode {
  return EntityNodeSchema.parse({
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Entity')],
    ...partial,
  });
}

export function createEpisodicNode(
  partial: Partial<EpisodicNode> & {
    name: NodeName;
    graphId: Uuid;
    content: string;
    validAt: Date;
  },
): EpisodicNode {
  return EpisodicNodeSchema.parse({
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Episodic')],
    source: EpisodeType.text,
    ...partial,
  });
}

export function createCommunityNode(
  partial: Partial<CommunityNode> & { name: NodeName; graphId: Uuid },
): CommunityNode {
  return CommunityNodeSchema.parse({
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Community')],
    ...partial,
  });
}

export function createSagaNode(
  partial: Partial<SagaNode> & { name: NodeName; graphId: Uuid },
): SagaNode {
  return SagaNodeSchema.parse({
    ...createNodeDefaults(),
    labels: [NodeLabelSchema.parse('Saga')],
    ...partial,
  });
}
