import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { Uuid, UuidSchema } from '@/common/schemas';

import { RelationshipType, RelationshipTypeSchema } from '../types';

// Schemas

export const EdgeBaseSchema = z.object({
  uuid: UuidSchema,
  graphId: UuidSchema,
  sourceNodeUuid: UuidSchema,
  targetNodeUuid: UuidSchema,
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
// CommunityEdge = HAS_MEMBER       (Community -> Entity)
// HasEpisodeEdge = HAS_EPISODE     (Saga      -> Episodic)
export const EpisodicEdgeSchema = EdgeBaseSchema;
export const CommunityEdgeSchema = EdgeBaseSchema;
export const HasEpisodeEdgeSchema = EdgeBaseSchema;

// Types

export type EdgeBase = z.infer<typeof EdgeBaseSchema>;
export type EntityEdge = z.infer<typeof EntityEdgeSchema>;
export type EpisodicEdge = z.infer<typeof EpisodicEdgeSchema>;
export type CommunityEdge = z.infer<typeof CommunityEdgeSchema>;
export type HasEpisodeEdge = z.infer<typeof HasEpisodeEdgeSchema>;

// Factories

export function createEdgeDefaults(): Omit<
  EdgeBase,
  'graphId' | 'sourceNodeUuid' | 'targetNodeUuid'
> {
  return {
    uuid: UuidSchema.parse(randomUUID()),
    createdAt: new Date(),
  };
}

export function createEntityEdge(
  partial: Partial<EntityEdge> & {
    name: RelationshipType;
    fact: string;
    graphId: Uuid;
    sourceNodeUuid: Uuid;
    targetNodeUuid: Uuid;
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
    sourceNodeUuid: Uuid;
    targetNodeUuid: Uuid;
  },
): EpisodicEdge {
  return EpisodicEdgeSchema.parse({ ...createEdgeDefaults(), ...partial });
}

export function createCommunityEdge(
  partial: Partial<CommunityEdge> & {
    graphId: Uuid;
    sourceNodeUuid: Uuid;
    targetNodeUuid: Uuid;
  },
): CommunityEdge {
  return CommunityEdgeSchema.parse({ ...createEdgeDefaults(), ...partial });
}

export function createHasEpisodeEdge(
  partial: Partial<HasEpisodeEdge> & {
    graphId: Uuid;
    sourceNodeUuid: Uuid;
    targetNodeUuid: Uuid;
  },
): HasEpisodeEdge {
  return HasEpisodeEdgeSchema.parse({ ...createEdgeDefaults(), ...partial });
}
