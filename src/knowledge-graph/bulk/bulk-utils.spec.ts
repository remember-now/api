import {
  buildDirectedUuidMap,
  compressUuidMap,
  resolveEdgePointers,
  UnionFind,
  withConcurrency,
} from './bulk-utils';

describe('withConcurrency', () => {
  it('returns results in input order', async () => {
    const tasks = [3, 1, 2].map((n) => () => Promise.resolve(n));
    const results = await withConcurrency(2, tasks);
    expect(results).toEqual([3, 1, 2]);
  });

  it('handles an empty task array', async () => {
    const results = await withConcurrency(5, []);
    expect(results).toEqual([]);
  });

  it('handles a single task', async () => {
    const results = await withConcurrency(5, [() => Promise.resolve(42)]);
    expect(results).toEqual([42]);
  });

  it('runs no more than limit tasks concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const limit = 3;
    const tasks = Array.from({ length: 9 }, () => () => {
      active++;
      maxActive = Math.max(maxActive, active);
      return Promise.resolve().then(() => {
        active--;
        return 1;
      });
    });
    await withConcurrency(limit, tasks);
    expect(maxActive).toBeLessThanOrEqual(limit);
  });

  it('rethrows a task rejection', async () => {
    const err = new Error('task failed');
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(err),
      () => Promise.resolve(3),
    ];
    await expect(withConcurrency(5, tasks)).rejects.toThrow('task failed');
  });
});

describe('UnionFind', () => {
  it('find returns self for singleton', () => {
    const uf = new UnionFind(['a']);
    expect(uf.find('a')).toBe('a');
  });

  it('union merges two elements', () => {
    const uf = new UnionFind(['a', 'b']);
    uf.union('a', 'b');
    expect(uf.find('a')).toBe(uf.find('b'));
  });

  it('lex-smaller uuid wins as root', () => {
    const uf = new UnionFind(['b', 'a']);
    uf.union('b', 'a');
    expect(uf.find('b')).toBe('a');
    expect(uf.find('a')).toBe('a');
  });

  it('path compression flattens long chain', () => {
    const uf = new UnionFind(['a', 'b', 'c', 'd']);
    uf.union('b', 'a'); // b → a
    uf.union('c', 'b'); // c → a (via b)
    uf.union('d', 'c'); // d → a (via c)
    expect(uf.find('d')).toBe('a');
    // After path compression, find should still return same root
    expect(uf.find('c')).toBe('a');
    expect(uf.find('b')).toBe('a');
  });

  it('idempotent union has no effect', () => {
    const uf = new UnionFind(['a', 'b']);
    uf.union('a', 'b');
    uf.union('a', 'b');
    expect(uf.find('a')).toBe(uf.find('b'));
  });
});

describe('compressUuidMap', () => {
  it('single pair: smaller uuid is canonical', () => {
    const map = compressUuidMap([['b', 'a']]);
    expect(map.get('a')).toBe('a');
    expect(map.get('b')).toBe('a');
  });

  it('chain a→b→c collapses to lex-min', () => {
    // All three end up in the same cluster; lex-min is 'a'
    const map = compressUuidMap([
      ['b', 'a'],
      ['c', 'b'],
    ]);
    expect(map.get('a')).toBe('a');
    expect(map.get('b')).toBe('a');
    expect(map.get('c')).toBe('a');
  });

  it('disjoint pairs stay separate', () => {
    const map = compressUuidMap([
      ['b', 'a'],
      ['d', 'c'],
    ]);
    expect(map.get('a')).toBe('a');
    expect(map.get('b')).toBe('a');
    expect(map.get('c')).toBe('c');
    expect(map.get('d')).toBe('c');
  });
});

describe('buildDirectedUuidMap', () => {
  it('directed pair b→a maps b to a', () => {
    const map = buildDirectedUuidMap([['b', 'a']]);
    expect(map.get('b')).toBe('a');
    expect(map.get('a')).toBe('a');
  });

  it('chain b→a, c→b collapses to a', () => {
    const map = buildDirectedUuidMap([
      ['b', 'a'],
      ['c', 'b'],
    ]);
    expect(map.get('c')).toBe('a');
    expect(map.get('b')).toBe('a');
  });

  it('independent pairs stay separate', () => {
    const map = buildDirectedUuidMap([
      ['b', 'a'],
      ['d', 'c'],
    ]);
    expect(map.get('b')).toBe('a');
    expect(map.get('d')).toBe('c');
  });
});

const makeEdge = (
  uuid: string,
  sourceNodeUuid: string,
  targetNodeUuid: string,
) =>
  ({
    uuid,
    sourceNodeUuid,
    targetNodeUuid,
    name: 'RELATES_TO',
    fact: 'test',
    groupId: 'g',
    episodes: [],
    createdAt: new Date(),
    validAt: null,
    invalidAt: null,
    expiredAt: null,
    factEmbedding: null,
    attributes: {},
  }) as Parameters<typeof resolveEdgePointers>[0][number];

describe('resolveEdgePointers', () => {
  it('remaps sourceNodeUuid and targetNodeUuid via map', () => {
    const edge = makeEdge('e1', 'old-src', 'old-tgt');
    const uuidMap = new Map([
      ['old-src', 'new-src'],
      ['old-tgt', 'new-tgt'],
    ]);
    const [result] = resolveEdgePointers([edge], uuidMap);
    expect(result.sourceNodeUuid).toBe('new-src');
    expect(result.targetNodeUuid).toBe('new-tgt');
  });

  it('unmapped uuids are unchanged', () => {
    const edge = makeEdge('e1', 'src', 'tgt');
    const uuidMap = new Map<string, string>();
    const [result] = resolveEdgePointers([edge], uuidMap);
    expect(result.sourceNodeUuid).toBe('src');
    expect(result.targetNodeUuid).toBe('tgt');
  });

  it('does not mutate input edge', () => {
    const edge = makeEdge('e1', 'old-src', 'old-tgt');
    const uuidMap = new Map([['old-src', 'new-src']]);
    resolveEdgePointers([edge], uuidMap);
    expect(edge.sourceNodeUuid).toBe('old-src');
  });
});
