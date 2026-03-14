import { z } from 'zod';

import { createEdgeDefaults, EdgeBase, EdgeBaseSchema } from './edge.types';

export interface EntityEdge extends EdgeBase {
  name: string;
  fact: string;
  factEmbedding: number[] | null;
  episodes: string[];
  expiredAt: Date | null;
  validAt: Date | null;
  invalidAt: Date | null;
  attributes: Record<string, unknown>;
}

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

export function createEntityEdge(
  partial: Partial<EntityEdge> & {
    name: string;
    sourceNodeUuid: string;
    targetNodeUuid: string;
  },
): EntityEdge {
  return {
    ...createEdgeDefaults(),
    fact: '',
    factEmbedding: null,
    episodes: [],
    expiredAt: null,
    validAt: null,
    invalidAt: null,
    attributes: {},
    ...partial,
  };
}
