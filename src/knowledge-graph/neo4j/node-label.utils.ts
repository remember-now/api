import { NodeLabel } from './types';

/** Deduplicates and sorts labels into a colon-joined Cypher label string
 * (e.g. `"Entity:Person"`).
 */
export function buildLabelString(labels: NodeLabel[]): string {
  return [...new Set(labels)].sort().join(':');
}

/**
 * Buckets nodes by their canonical label string so each bulk `UNWIND` can use a
 * single static label in its `MERGE` clause.
 */
export function groupNodesByLabel<T extends { labels: NodeLabel[] }>(
  nodes: T[],
): Map<string, T[]> {
  const byLabel = new Map<string, T[]>();
  for (const n of nodes) {
    const key = [...new Set(n.labels)].sort().join(':');
    byLabel.set(key, [...(byLabel.get(key) ?? []), n]);
  }
  return byLabel;
}
