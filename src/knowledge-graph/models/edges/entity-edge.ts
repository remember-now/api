import { z } from 'zod';

import { createEdgeDefaults, EdgeBaseSchema } from './edge.types';

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

export type EntityEdge = z.infer<typeof EntityEdgeSchema>;

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
