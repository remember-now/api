import { NodeLabelsSchema } from './types';

/** Validates, deduplicates, and sorts labels into a colon-joined Cypher label string
 * (e.g. `"Entity:Person"`).
 */
export function buildLabelString(labels: string[]): string {
  NodeLabelsSchema.parse(labels);
  return [...new Set(labels)].sort().join(':');
}

/**
 * Buckets nodes by their canonical label string so each bulk `UNWIND` can use a
 * single static label in its `MERGE` clause. Validates all label sets before returning.
 */
export function groupNodesByLabel<T extends { labels: string[] }>(
  nodes: T[],
): Map<string, T[]> {
  const byLabel = new Map<string, T[]>();
  for (const n of nodes) {
    const key = [...new Set(n.labels)].sort().join(':');
    byLabel.set(key, [...(byLabel.get(key) ?? []), n]);
  }
  for (const key of byLabel.keys()) {
    NodeLabelsSchema.parse(key.split(':'));
  }
  return byLabel;
}
