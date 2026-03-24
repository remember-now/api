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

export type TemporalField =
  | 'valid_at'
  | 'invalid_at'
  | 'created_at'
  | 'expired_at';

export interface TemporalFilter {
  field: TemporalField;
  op: TemporalComparison;
  /** Required for all ops except isNull / isNotNull. */
  value?: Date;
}

export interface SearchFilters {
  /** Filter entity nodes by label (e.g. ['Person', 'Organization']). */
  nodeLabels?: string[];
  /** Filter entity edges by their name/type property. */
  edgeTypes?: string[];
  /**
   * Temporal conditions applied to the matched entities.
   *
   * Mirrors Python Graphiti's `list[list[DateFilter]]` structure:
   * - Outer array: OR groups — at least one group must match.
   * - Inner array: AND conditions — all conditions within a group must match.
   *
   * Example: `[[{ field: 'valid_at', op: gte, value: t1 }, { field: 'valid_at', op: lt, value: t2 }], [{ field: 'valid_at', op: isNull }]]`
   * produces: `((e.valid_at >= $p AND e.valid_at < $p2) OR (e.valid_at IS NULL))`
   */
  temporalFilters?: TemporalFilter[][];
  /** Only return edges whose UUID is in this list. */
  edgeUuids?: string[];
}
