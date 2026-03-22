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
  // TODO: Python Graphiti supports nested AND/OR temporal filter groups
  // (list[list[DateFilter]]). This port uses a flat AND-only list. Extend
  // SearchFilters with OR-group semantics when needed.
  /** Temporal conditions applied to the matched entities. */
  temporalFilters?: TemporalFilter[];
  /** Only return edges whose UUID is in this list. */
  edgeUuids?: string[];
}
