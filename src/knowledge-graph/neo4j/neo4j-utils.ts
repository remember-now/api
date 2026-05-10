import neo4j, { DateTime, Integer, isDateTime, isInt } from 'neo4j-driver';

export function toNeo4jDateTime(date: Date): DateTime<number> {
  return neo4j.types.DateTime.fromStandardDate(date);
}

export function fromNeo4jDateTime(dt: DateTime<number | Integer>): Date {
  return new Date(dt.toString());
}

export function toNeo4jInt(value: number): Integer {
  return neo4j.int(value);
}

export function fromNeo4jInt(value: Integer): number {
  return neo4j.integer.toNumber(value);
}

export function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isInt(value)) return fromNeo4jInt(value);
  if (isDateTime(value)) return fromNeo4jDateTime(value);
  if (Array.isArray(value)) return value.map(convertValue);
  // TODO: add explicit isNode/isRelationship guards here — currently Node/Relationship objects
  // fall through to the object branch and only their .properties are preserved
  // (elementId, labels, type, startNodeElementId, endNodeElementId are silently dropped).
  // Not currently a bug since all RETURN clauses use flat property projections.
  if (typeof value === 'object') return convertRecord(value as Record<string, unknown>);
  return value;
}

export function convertRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    result[key] = convertValue(val);
  }
  return result;
}

/**
 * Escapes Lucene special characters in a query string so it is safe to pass
 * to db.index.fulltext.queryNodes / queryRelationships.
 */
export function luceneSanitize(query: string): string {
  return query.replace(/[+\-&|!(){}[\]^"~*?:\\/ORNTAD]/g, '\\$&');
}

/**
 * Builds a Lucene query string that combines free-text search with a
 * group_id filter.
 */
export function buildFulltextQuery(query: string, groupIds: string[]): string {
  const sanitized = luceneSanitize(query);
  const groupPart = groupIds.map((id) => `group_id:"${luceneSanitize(id)}"`).join(' OR ');
  return sanitized ? `(${sanitized}) AND (${groupPart})` : `(${groupPart})`;
}
