import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { Uuid, UuidSchema } from '@/common/schemas';

import { RelationshipType, RelationshipTypeSchema } from '../types';

// Schemas

export const EdgeBaseSchema = z.object({
  id: UuidSchema,
  graphId: UuidSchema,
  sourceNodeId: UuidSchema,
  targetNodeId: UuidSchema,
  createdAt: z.date(),
});

export const EntityEdgeSchema = EdgeBaseSchema.extend({
  name: RelationshipTypeSchema,
  fact: z.string(),
  factEmbedding: z.array(z.number()).nullable().default(null),
  episodes: z.array(UuidSchema).default([]),
  expiredAt: z.date().nullable().default(null),
  validAt: z.date().nullable().default(null),
  invalidAt: z.date().nullable().default(null),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

// EpisodicEdge  = MENTIONS         (Episodic -> Entity)
// HasEpisodeEdge = HAS_EPISODE     (Saga      -> Episodic)
// Community membership is stored as `Community.memberIds UUID[]`, not as edges.
export const EpisodicEdgeSchema = EdgeBaseSchema;
export const HasEpisodeEdgeSchema = EdgeBaseSchema;

// Types

export type EdgeBase = z.infer<typeof EdgeBaseSchema>;
export type EntityEdge = z.infer<typeof EntityEdgeSchema>;
export type EpisodicEdge = z.infer<typeof EpisodicEdgeSchema>;
export type HasEpisodeEdge = z.infer<typeof HasEpisodeEdgeSchema>;

// Factories

export function createEdgeDefaults(): Omit<
  EdgeBase,
  'graphId' | 'sourceNodeId' | 'targetNodeId'
> {
  return {
    id: UuidSchema.parse(randomUUID()),
    createdAt: new Date(),
  };
}

export function createEntityEdge(
  partial: Partial<EntityEdge> & {
    name: RelationshipType;
    fact: string;
    graphId: Uuid;
    sourceNodeId: Uuid;
    targetNodeId: Uuid;
  },
): EntityEdge {
  return EntityEdgeSchema.parse({
    ...createEdgeDefaults(),
    ...partial,
  });
}

export function createEpisodicEdge(
  partial: Partial<EpisodicEdge> & {
    graphId: Uuid;
    sourceNodeId: Uuid;
    targetNodeId: Uuid;
  },
): EpisodicEdge {
  return EpisodicEdgeSchema.parse({ ...createEdgeDefaults(), ...partial });
}

export function createHasEpisodeEdge(
  partial: Partial<HasEpisodeEdge> & {
    graphId: Uuid;
    sourceNodeId: Uuid;
    targetNodeId: Uuid;
  },
): HasEpisodeEdge {
  return HasEpisodeEdgeSchema.parse({ ...createEdgeDefaults(), ...partial });
}
