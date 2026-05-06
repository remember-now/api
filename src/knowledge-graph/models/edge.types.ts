import { randomUUID } from 'node:crypto';

import { z } from 'zod';

// Schemas

export const EdgeBaseSchema = z.object({
  uuid: z.uuid(),
  groupId: z.string().min(1),
  sourceNodeUuid: z.uuid(),
  targetNodeUuid: z.uuid(),
  createdAt: z.date(),
});

export const EntityEdgeSchema = EdgeBaseSchema.extend({
  name: z.string().min(1),
  fact: z.string(),
  factEmbedding: z.array(z.number()).nullable(),
  episodes: z.array(z.string()),
  expiredAt: z.date().nullable(),
  validAt: z.date().nullable(),
  invalidAt: z.date().nullable(),
  attributes: z.record(z.string(), z.unknown()),
});

// EpisodicEdge  = MENTIONS         (Episodic → Entity)
// CommunityEdge = HAS_MEMBER       (Community → Entity)
// HasEpisodeEdge = HAS_EPISODE     (Saga → Episodic)
// NextEpisodeEdge = NEXT_EPISODE   (Episodic → Episodic)
export const EpisodicEdgeSchema = EdgeBaseSchema;
export const CommunityEdgeSchema = EdgeBaseSchema;
export const HasEpisodeEdgeSchema = EdgeBaseSchema;
export const NextEpisodeEdgeSchema = EdgeBaseSchema;

// Types

export type EdgeBase = z.infer<typeof EdgeBaseSchema>;
export type EntityEdge = z.infer<typeof EntityEdgeSchema>;
export type EpisodicEdge = z.infer<typeof EpisodicEdgeSchema>;
export type CommunityEdge = z.infer<typeof CommunityEdgeSchema>;
export type HasEpisodeEdge = z.infer<typeof HasEpisodeEdgeSchema>;
export type NextEpisodeEdge = z.infer<typeof NextEpisodeEdgeSchema>;

// Factories

export function createEdgeDefaults(): Omit<
  EdgeBase,
  'groupId' | 'sourceNodeUuid' | 'targetNodeUuid'
> {
  return {
    uuid: randomUUID(),
    createdAt: new Date(),
  };
}

export function createEntityEdge(
  partial: Partial<EntityEdge> & {
    name: string;
    fact: string;
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): EntityEdge {
  return {
    ...createEdgeDefaults(),
    factEmbedding: null,
    episodes: [],
    expiredAt: null,
    validAt: null,
    invalidAt: null,
    attributes: {},
    ...partial,
  };
}

export function createEpisodicEdge(
  partial: Partial<EpisodicEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): EpisodicEdge {
  return { ...createEdgeDefaults(), ...partial };
}

export function createCommunityEdge(
  partial: Partial<CommunityEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): CommunityEdge {
  return { ...createEdgeDefaults(), ...partial };
}

export function createHasEpisodeEdge(
  partial: Partial<HasEpisodeEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): HasEpisodeEdge {
  return { ...createEdgeDefaults(), ...partial };
}

export function createNextEpisodeEdge(
  partial: Partial<NextEpisodeEdge> & {
    groupId: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): NextEpisodeEdge {
  return { ...createEdgeDefaults(), ...partial };
}
