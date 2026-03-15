import neo4j, { DateTime, Integer, isDateTime, isInt } from 'neo4j-driver';

export function toNeo4jDateTime(date: Date): DateTime<number> {
  return neo4j.types.DateTime.fromStandardDate(date);
}

export function fromNeo4jDateTime(dt: DateTime<number | Integer>): Date {
  return new Date(dt.toString());
}

export function fromNeo4jInt(value: Integer): number {
  return neo4j.integer.toNumber(value);
}

export function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isInt(value)) return fromNeo4jInt(value);
  if (isDateTime(value)) return fromNeo4jDateTime(value);
  if (Array.isArray(value)) return value.map(convertValue);
  if (typeof value === 'object')
    return convertRecord(value as Record<string, unknown>);
  return value;
}

export function convertRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    result[key] = convertValue(val);
  }
  return result;
}
