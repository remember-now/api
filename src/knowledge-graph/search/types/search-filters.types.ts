import { z } from 'zod';

import { UuidSchema } from '@/common/schemas';

import { NodeLabelSchema, RelationshipTypeSchema } from '../../types';

// Enums

export enum TemporalComparison {
  eq = '=',
  neq = '<>',
  lt = '<',
  gt = '>',
  lte = '<=',
  gte = '>=',
  isNull = 'IS NULL',
  isNotNull = 'IS NOT NULL',
}

// Schemas

export const TemporalFieldSchema = z.enum([
  'valid_at',
  'invalid_at',
  'created_at',
  'expired_at',
]);

export const TemporalFilterSchema = z.object({
  field: TemporalFieldSchema,
  op: z.enum(TemporalComparison),
  /** Required for all ops except isNull / isNotNull. */
  value: z.date().optional(),
});

export const SearchFiltersSchema = z.object({
  /** Filter entity nodes by label (e.g. ['Person', 'Organization']). */
  nodeLabels: z.array(NodeLabelSchema).min(1).optional(),
  /** Filter entity edges by their name/type property. */
  edgeTypes: z.array(RelationshipTypeSchema).optional(),
  /**
   * Temporal conditions applied to the matched entities.
   *
   * Mirrors Python Graphiti's `list[list[DateFilter]]` structure:
   * - Outer array: OR groups - at least one group must match.
   * - Inner array: AND conditions - all conditions within a group must match.
   *
   * Example: `[[{ field: 'valid_at', op: gte, value: t1 }, { field: 'valid_at', op: lt, value: t2 }], [{ field: 'valid_at', op: isNull }]]`
   * produces: `((e.valid_at >= $p AND e.valid_at < $p2) OR (e.valid_at IS NULL))`
   */
  temporalFilters: z.array(z.array(TemporalFilterSchema)).optional(),
  /** Only return edges whose UUID is in this list. */
  edgeUuids: z.array(UuidSchema).optional(),
});

// Types

export type TemporalField = z.infer<typeof TemporalFieldSchema>;
export type TemporalFilter = z.infer<typeof TemporalFilterSchema>;
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;
