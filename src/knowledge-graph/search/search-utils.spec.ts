import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { Neo4jService } from '../neo4j/neo4j.service';
import {
  crossEncoderReranker,
  episodeMentionsReranker,
  mmr,
  nodeDistanceReranker,
  rrf,
} from './search-utils';

// ─── rrf ─────────────────────────────────────────────────────────────────────

describe('rrf', () => {
  it('ranks a single list in input order with correct scores', () => {
    const [uuids, scores] = rrf([['a', 'b', 'c']]);
    expect(uuids).toEqual(['a', 'b', 'c']);
    expect(scores[0]).toBeCloseTo(1 / 1);
    expect(scores[1]).toBeCloseTo(1 / 2);
    expect(scores[2]).toBeCloseTo(1 / 3);
  });

  it('accumulates scores from two disjoint lists', () => {
    const [uuids, scores] = rrf([['a'], ['b']]);
    // Both rank 0 in their respective lists → score = 1
    expect(scores[0]).toBeCloseTo(1);
    expect(scores[1]).toBeCloseTo(1);
    expect(uuids).toHaveLength(2);
  });

  it('adds scores for a UUID that appears in multiple lists', () => {
    // 'a' is rank 0 in both lists → 1/1 + 1/1 = 2
    // 'b' is rank 1 in list 1    → 1/2
    // 'c' is rank 1 in list 2    → 1/2
    const [uuids, scores] = rrf([
      ['a', 'b'],
      ['a', 'c'],
    ]);
    expect(uuids[0]).toBe('a');
    expect(scores[0]).toBeCloseTo(2);
    expect(scores[1]).toBeCloseTo(0.5);
    expect(scores[2]).toBeCloseTo(0.5);
  });

  it('filters UUIDs whose score is below minScore', () => {
    // 'a' score = 1/1 = 1, 'b' score = 1/2 = 0.5
    const [uuids] = rrf([['a', 'b']], 0.6);
    expect(uuids).toEqual(['a']);
  });

  it('returns empty arrays for an empty input', () => {
    expect(rrf([])).toEqual([[], []]);
  });

  it('ignores empty inner lists', () => {
    const [uuids, scores] = rrf([[], ['a']]);
    expect(uuids).toEqual(['a']);
    expect(scores[0]).toBeCloseTo(1);
  });
});

// ─── mmr ─────────────────────────────────────────────────────────────────────

describe('mmr', () => {
  it('returns empty arrays for empty candidates', () => {
    expect(mmr([1, 0], new Map())).toEqual([[], []]);
  });

  it('returns a single candidate with a computed score', () => {
    const [uuids, scores] = mmr([1, 0], new Map([['a', [1, 0]]]), 1, -1);
    expect(uuids).toEqual(['a']);
    expect(scores[0]).toBeCloseTo(1); // lambda=1: dot([1,0],[1,0]) = 1
  });

  it('with lambda=1 (pure relevance) ranks more similar candidate first', () => {
    // query = [1, 0]
    // 'a' = [1, 0] → cos = 1  (most similar)
    // 'b' = [0, 1] → cos = 0
    const [uuids] = mmr(
      [1, 0],
      new Map([
        ['a', [1, 0]],
        ['b', [0, 1]],
      ]),
      1,
      -1,
    );
    expect(uuids[0]).toBe('a');
  });

  it('with lambda=0 (pure diversity) ranks least correlated candidate first', () => {
    // query = [1, 0, 0]
    // 'a' = [1, 0, 0]  — strongly correlated with 'c'
    // 'b' = [0, 1, 0]  — uncorrelated with both others
    // 'c' = [0.9, 0.1, 0] — strongly correlated with 'a'
    // With lambda=0: mmr = -maxPairwiseSim
    // maxSim(b) ≈ 0.1  → mmr(b) ≈ -0.1  (highest / least penalised)
    // maxSim(a) ≈ 0.99 → mmr(a) ≈ -0.99 (most penalised)
    const [uuids] = mmr(
      [1, 0, 0],
      new Map([
        ['a', [1, 0, 0]],
        ['b', [0, 1, 0]],
        ['c', [0.9, 0.1, 0]],
      ]),
      0,
      -1,
    );
    expect(uuids[0]).toBe('b');
  });

  it('filters candidates below minScore', () => {
    // lambda=1, query=[1,0]: 'a' score≈1, 'b' score≈0
    const [uuids] = mmr(
      [1, 0],
      new Map([
        ['a', [1, 0]],
        ['b', [0, 1]],
      ]),
      1,
      0.5,
    );
    expect(uuids).toEqual(['a']);
  });

  it('handles a zero-vector candidate without producing NaN', () => {
    const [uuids, scores] = mmr([1, 0], new Map([['a', [0, 0]]]), 1, -1);
    expect(uuids).toEqual(['a']);
    expect(Number.isNaN(scores[0])).toBe(false);
  });
});

// ─── nodeDistanceReranker ─────────────────────────────────────────────────────

describe('nodeDistanceReranker', () => {
  let neo4j: ReturnType<typeof mockDeep<Neo4jService>>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
  });

  afterEach(() => jest.clearAllMocks());

  it('places a directly connected node above an unconnected node', async () => {
    // 'b' is connected (DB returns score=1), 'c' is not (absent from DB)
    neo4j.executeRead.mockResolvedValue([{ uuid: 'b', score: 1 }]);

    const [uuids, scores] = await nodeDistanceReranker(
      neo4j,
      ['b', 'c'],
      'center',
    );
    expect(uuids[0]).toBe('b');
    expect(scores[0]).toBeCloseTo(1); // 1/1
    expect(uuids[1]).toBe('c');
    expect(scores[1]).toBeCloseTo(0); // 1/Infinity → 0
  });

  it('prepends the center node at rank 1 when it is in the input list', async () => {
    neo4j.executeRead.mockResolvedValue([{ uuid: 'b', score: 1 }]);

    const [uuids, scores] = await nodeDistanceReranker(
      neo4j,
      ['center', 'b', 'c'],
      'center',
    );
    expect(uuids[0]).toBe('center');
    expect(scores[0]).toBeCloseTo(10); // 1 / 0.1
  });

  it('does not prepend the center node when it is absent from the input list', async () => {
    neo4j.executeRead.mockResolvedValue([{ uuid: 'b', score: 1 }]);

    const [uuids] = await nodeDistanceReranker(neo4j, ['b', 'c'], 'center');
    expect(uuids[0]).toBe('b');
    expect(uuids).not.toContain('center');
  });

  it('filters unconnected nodes when minScore > 0', async () => {
    neo4j.executeRead.mockResolvedValue([{ uuid: 'b', score: 1 }]);

    // unconnected 'c' gets score 0, which is below minScore=0.5
    const [uuids] = await nodeDistanceReranker(
      neo4j,
      ['b', 'c'],
      'center',
      0.5,
    );
    expect(uuids).not.toContain('c');
    expect(uuids).toContain('b');
  });

  it('returns empty and makes no DB call when nodeUuids is empty', async () => {
    const [uuids, scores] = await nodeDistanceReranker(neo4j, [], 'center');
    expect(uuids).toEqual([]);
    expect(scores).toEqual([]);
    expect(neo4j.executeRead).not.toHaveBeenCalled();
  });

  it('returns only the center node and makes no DB call when it is the only input', async () => {
    const [uuids, scores] = await nodeDistanceReranker(
      neo4j,
      ['center'],
      'center',
    );
    expect(uuids).toEqual(['center']);
    expect(scores[0]).toBeCloseTo(10); // 1 / 0.1
    expect(neo4j.executeRead).not.toHaveBeenCalled();
  });
});

// ─── episodeMentionsReranker ──────────────────────────────────────────────────

describe('episodeMentionsReranker', () => {
  let neo4j: ReturnType<typeof mockDeep<Neo4jService>>;

  beforeEach(() => {
    neo4j = mockDeep<Neo4jService>();
  });

  afterEach(() => jest.clearAllMocks());

  it('ranks the most-mentioned node first', async () => {
    neo4j.executeRead.mockResolvedValue([
      { uuid: 'node-a', score: 20 },
      { uuid: 'node-b', score: 5 },
    ]);

    const [uuids, scores] = await episodeMentionsReranker(neo4j, [
      ['node-a', 'node-b'],
    ]);
    expect(uuids[0]).toBe('node-a');
    expect(scores[0]).toBe(20);
    expect(uuids[1]).toBe('node-b');
    expect(scores[1]).toBe(5);
  });

  it('places zero-mention nodes after positively-mentioned nodes', async () => {
    // node-c is absent from DB result → sentinel score 0
    neo4j.executeRead.mockResolvedValue([
      { uuid: 'node-a', score: 20 },
      { uuid: 'node-b', score: 5 },
    ]);

    const [uuids] = await episodeMentionsReranker(neo4j, [
      ['node-a', 'node-b', 'node-c'],
    ]);
    expect(uuids.indexOf('node-a')).toBeLessThan(uuids.indexOf('node-c'));
    expect(uuids.indexOf('node-b')).toBeLessThan(uuids.indexOf('node-c'));
  });

  it('excludes zero-mention nodes when minScore = 1', async () => {
    neo4j.executeRead.mockResolvedValue([
      { uuid: 'node-a', score: 20 },
      { uuid: 'node-b', score: 5 },
    ]);

    const [uuids] = await episodeMentionsReranker(
      neo4j,
      [['node-a', 'node-b', 'node-c']],
      1,
    );
    expect(uuids).not.toContain('node-c');
    expect(uuids).toContain('node-a');
    expect(uuids).toContain('node-b');
  });

  it('returns empty and makes no DB call for empty input', async () => {
    const [uuids, scores] = await episodeMentionsReranker(neo4j, [[]]);
    expect(uuids).toEqual([]);
    expect(scores).toEqual([]);
    expect(neo4j.executeRead).not.toHaveBeenCalled();
  });

  it('returns all nodes with score 0 when none are mentioned', async () => {
    neo4j.executeRead.mockResolvedValue([]);

    const [uuids, scores] = await episodeMentionsReranker(neo4j, [
      ['node-a', 'node-b'],
    ]);
    expect(uuids).toHaveLength(2);
    expect(scores.every((s) => s === 0)).toBe(true);
  });
});

// ─── crossEncoderReranker ─────────────────────────────────────────────────────

describe('crossEncoderReranker', () => {
  let model: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    model = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    model.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns empty immediately for empty items without calling the model', async () => {
    const [uuids, scores] = await crossEncoderReranker(model, 'query', []);
    expect(uuids).toEqual([]);
    expect(scores).toEqual([]);
    expect(model.withStructuredOutput).not.toHaveBeenCalled();
  });

  it('normalises raw scores from [0, 100] to [0, 1]', async () => {
    mockRunnable.invoke.mockResolvedValue({ score: 80 });

    const [, scores] = await crossEncoderReranker(model, 'query', [
      { uuid: 'a', text: 'foo' },
    ]);
    expect(scores[0]).toBeCloseTo(0.8);
  });

  it('ranks items by score descending', async () => {
    mockRunnable.invoke
      .mockResolvedValueOnce({ score: 40 }) // item 'a'
      .mockResolvedValueOnce({ score: 80 }); // item 'b'

    const [uuids] = await crossEncoderReranker(model, 'query', [
      { uuid: 'a', text: 'less relevant' },
      { uuid: 'b', text: 'more relevant' },
    ]);
    expect(uuids[0]).toBe('b');
    expect(uuids[1]).toBe('a');
  });

  it('filters items whose normalised score is below minScore', async () => {
    mockRunnable.invoke
      .mockResolvedValueOnce({ score: 80 }) // 0.8 — passes
      .mockResolvedValueOnce({ score: 40 }); // 0.4 — filtered

    const [uuids] = await crossEncoderReranker(
      model,
      'query',
      [
        { uuid: 'a', text: 'high relevance' },
        { uuid: 'b', text: 'low relevance' },
      ],
      0.5,
    );
    expect(uuids).toEqual(['a']);
  });

  it('invokes the model once per item', async () => {
    mockRunnable.invoke.mockResolvedValue({ score: 50 });

    await crossEncoderReranker(model, 'query', [
      { uuid: 'a', text: 'one' },
      { uuid: 'b', text: 'two' },
      { uuid: 'c', text: 'three' },
    ]);
    expect(mockRunnable.invoke).toHaveBeenCalledTimes(3);
  });
});
