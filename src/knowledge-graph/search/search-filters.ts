import { validateNodeLabels } from '../neo4j/neo4j-label-validation';
import { SearchFilters, TemporalComparison } from './search-filters.types';

export interface FilterClauseResult {
  /** Zero or more AND-joined conditions (no leading WHERE/AND keyword). */
  clause: string;
  params: Record<string, unknown>;
}

const TEMPORAL_FIELDS = new Set([
  'valid_at',
  'invalid_at',
  'created_at',
  'expired_at',
]);

const WHITELISTED_OPS = new Set<string>(Object.values(TemporalComparison));

/**
 * Escapes Lucene special characters in a query string so it is safe to pass
 * to db.index.fulltext.queryNodes / queryRelationships.
 */
export function luceneSanitize(query: string): string {
  return query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
}

/**
 * Builds temporal WHERE conditions from OR-groups of AND-joined filters.
 *
 * Each outer group produces one parenthesized AND expression; groups are
 * OR-joined. A single group with a single filter produces a bare condition
 * without extra parentheses.
 *
 * Mirrors Python's edge_search_filter_query_constructor (search_ops.py:149-178).
 */
function buildTemporalConditions(
  temporalFilters: SearchFilters['temporalFilters'],
  alias: string,
  params: Record<string, unknown>,
): string[] {
  if (!temporalFilters || temporalFilters.length === 0) return [];

  const groupClauses: string[] = [];

  for (let outerIdx = 0; outerIdx < temporalFilters.length; outerIdx++) {
    const group = temporalFilters[outerIdx];
    const andParts: string[] = [];

    for (let innerIdx = 0; innerIdx < group.length; innerIdx++) {
      const tf = group[innerIdx];
      if (!TEMPORAL_FIELDS.has(tf.field)) continue;
      if (!WHITELISTED_OPS.has(tf.op)) continue;

      if (tf.op === TemporalComparison.isNull) {
        andParts.push(`${alias}.${tf.field} IS NULL`);
      } else if (tf.op === TemporalComparison.isNotNull) {
        andParts.push(`${alias}.${tf.field} IS NOT NULL`);
      } else {
        const paramName = `filterTemporal_${outerIdx}_${innerIdx}`;
        andParts.push(`${alias}.${tf.field} ${tf.op} $${paramName}`);
        params[paramName] = tf.value;
      }
    }

    if (andParts.length > 0) {
      groupClauses.push(
        andParts.length === 1 ? andParts[0] : `(${andParts.join(' AND ')})`,
      );
    }
  }

  if (groupClauses.length === 0) return [];
  if (groupClauses.length === 1) return [groupClauses[0]];
  return [`(${groupClauses.join(' OR ')})`];
}

/**
 * Builds a Cypher WHERE fragment and associated params for edge search filters.
 *
 * @param filters - The search filters to apply.
 * @param alias - The Cypher alias for the relationship variable (e.g. 'e').
 */
export function buildEdgeFilterClause(
  filters: SearchFilters,
  alias: string,
): FilterClauseResult {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.edgeUuids && filters.edgeUuids.length > 0) {
    conditions.push(`${alias}.uuid IN $filterEdgeUuids`);
    params['filterEdgeUuids'] = filters.edgeUuids;
  }

  if (filters.edgeTypes && filters.edgeTypes.length > 0) {
    conditions.push(`${alias}.name IN $filterEdgeTypes`);
    params['filterEdgeTypes'] = filters.edgeTypes;
  }

  conditions.push(
    ...buildTemporalConditions(filters.temporalFilters, alias, params),
  );

  return { clause: conditions.join(' AND '), params };
}

/**
 * Builds a Cypher WHERE fragment and associated params for node search filters.
 *
 * @param filters - The search filters to apply.
 * @param alias - The Cypher alias for the node variable (e.g. 'n').
 */
export function buildNodeFilterClause(
  filters: SearchFilters,
  alias: string,
): FilterClauseResult {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.nodeLabels && filters.nodeLabels.length > 0) {
    validateNodeLabels(filters.nodeLabels);
    conditions.push(
      `ANY(label IN labels(${alias}) WHERE label IN $filterNodeLabels)`,
    );
    params['filterNodeLabels'] = filters.nodeLabels;
  }

  conditions.push(
    ...buildTemporalConditions(filters.temporalFilters, alias, params),
  );

  return { clause: conditions.join(' AND '), params };
}
