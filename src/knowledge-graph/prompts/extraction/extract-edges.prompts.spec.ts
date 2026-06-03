import { RelationshipTypeSchema } from '@/knowledge-graph/types';

import {
  buildExtractEdgesValidator,
  buildExtractTimestampsValidator,
} from './extract-edges.prompts';

const rel = (s: string) => RelationshipTypeSchema.parse(s);

describe('buildExtractEdgesValidator', () => {
  const validate = buildExtractEdgesValidator({
    nodes: [{ name: 'Alice' }, { name: 'Bob' }],
  });

  const edge = (
    overrides: Partial<{
      source: number;
      target: number;
      validAt: string | null;
      invalidAt: string | null;
    }>,
  ) => ({
    sourceEntityIdx: overrides.source ?? 0,
    targetEntityIdx: overrides.target ?? 1,
    relationType: rel('WORKS_WITH'),
    fact: 'Alice works with Bob',
    validAt: overrides.validAt,
    invalidAt: overrides.invalidAt,
  });

  it('passes valid endpoints', () => {
    expect(validate({ edges: [edge({})] })).toEqual([]);
  });

  it('flags source idx out of range', () => {
    expect(validate({ edges: [edge({ source: 5 })] }).length).toBeGreaterThan(0);
  });

  it('flags target idx out of range', () => {
    expect(validate({ edges: [edge({ target: 5 })] }).length).toBeGreaterThan(0);
  });

  it('flags self-loop', () => {
    expect(validate({ edges: [edge({ target: 0 })] }).length).toBeGreaterThan(0);
  });

  it('passes an ordered validity interval', () => {
    expect(
      validate({
        edges: [
          edge({ validAt: '2025-01-01T00:00:00Z', invalidAt: '2025-06-01T00:00:00Z' }),
        ],
      }),
    ).toEqual([]);
  });

  it('flags an inverted validity interval', () => {
    expect(
      validate({
        edges: [
          edge({ validAt: '2025-06-01T00:00:00Z', invalidAt: '2025-01-01T00:00:00Z' }),
        ],
      }).length,
    ).toBeGreaterThan(0);
  });
});

describe('buildExtractTimestampsValidator', () => {
  const validate = buildExtractTimestampsValidator();

  it('passes when a bound is missing', () => {
    expect(validate({ validAt: '2025-01-01T00:00:00Z', invalidAt: null })).toEqual([]);
  });

  it('flags an inverted validity interval', () => {
    expect(
      validate({
        validAt: '2025-06-01T00:00:00Z',
        invalidAt: '2025-01-01T00:00:00Z',
      }).length,
    ).toBeGreaterThan(0);
  });
});
