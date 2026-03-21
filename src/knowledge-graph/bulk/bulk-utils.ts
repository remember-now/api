import { EntityEdge } from '../models/edges/entity-edge';

// ─── UnionFind ────────────────────────────────────────────────────────────────

/**
 * Union-Find (disjoint set) with iterative path compression.
 * When merging two roots, the lexicographically larger root is attached under
 * the smaller one — so `find()` always returns the lex-smallest representative.
 */
export class UnionFind {
  private readonly parent: Map<string, string>;

  constructor(elements: Iterable<string>) {
    this.parent = new Map([...elements].map((e) => [e, e]));
  }

  find(x: string): string {
    // Iterative path compression
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // Attach lex-larger under lex-smaller
    if (ra < rb) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(ra, rb);
    }
  }
}

// ─── compressUuidMap ──────────────────────────────────────────────────────────

/**
 * Maps each UUID to the lexicographically smallest canonical UUID in its
 * duplicate cluster. Used for within-batch bidirectional deduplication.
 */
export function compressUuidMap(
  pairs: [string, string][],
): Map<string, string> {
  const allUuids = new Set<string>();
  for (const [a, b] of pairs) {
    allUuids.add(a);
    allUuids.add(b);
  }

  const uf = new UnionFind(allUuids);
  for (const [a, b] of pairs) {
    uf.union(a, b);
  }

  return new Map([...allUuids].map((uuid) => [uuid, uf.find(uuid)]));
}

// ─── buildDirectedUuidMap ─────────────────────────────────────────────────────

/**
 * Builds a directed alias → canonical map from (extractedUuid, canonicalUuid)
 * pairs returned by node resolution. Uses union-find with path compression so
 * chains of aliases collapse to their ultimate canonical target.
 */
export function buildDirectedUuidMap(
  pairs: [string, string][],
): Map<string, string> {
  const parent = new Map<string, string>();

  const find = (uuid: string): string => {
    if (!parent.has(uuid)) parent.set(uuid, uuid);
    let root = uuid;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = uuid;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  for (const [src, tgt] of pairs) {
    if (!parent.has(src)) parent.set(src, src);
    if (!parent.has(tgt)) parent.set(tgt, tgt);
    parent.set(find(src), find(tgt));
  }

  return new Map([...parent.keys()].map((uuid) => [uuid, find(uuid)]));
}

// ─── resolveEdgePointers ─────────────────────────────────────────────────────

/**
 * Remaps edge source/target node UUIDs through a deduplication map.
 * Returns new edge objects; does not mutate input.
 */
export function resolveEdgePointers(
  edges: EntityEdge[],
  uuidMap: Map<string, string>,
): EntityEdge[] {
  return edges.map((e) => ({
    ...e,
    sourceNodeUuid: uuidMap.get(e.sourceNodeUuid) ?? e.sourceNodeUuid,
    targetNodeUuid: uuidMap.get(e.targetNodeUuid) ?? e.targetNodeUuid,
  }));
}
