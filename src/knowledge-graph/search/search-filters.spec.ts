import {
  buildEdgeFilterClause,
  buildNodeFilterClause,
  luceneSanitize,
} from './search-filters';
import { TemporalComparison } from './search-filters.types';

// ─── luceneSanitize ───────────────────────────────────────────────────────────

describe('luceneSanitize', () => {
  it('leaves plain strings unchanged', () => {
    expect(luceneSanitize('hello world')).toBe('hello world');
  });

  it('escapes all Lucene special characters', () => {
    const specials = '+ - & | ! ( ) { } [ ] ^ " ~ * ? : \\ /';
    const result = luceneSanitize(specials);
    // Every special char should be preceded by a backslash
    for (const ch of [
      '+',
      '-',
      '&',
      '|',
      '!',
      '(',
      ')',
      '{',
      '}',
      '[',
      ']',
      '^',
      '"',
      '~',
      '*',
      '?',
      ':',
      '\\',
      '/',
    ]) {
      expect(result).toContain('\\' + ch);
    }
  });

  it('preserves embedded spaces', () => {
    expect(luceneSanitize('foo bar')).toBe('foo bar');
  });

  it('returns empty string unchanged', () => {
    expect(luceneSanitize('')).toBe('');
  });
});

// ─── buildNodeFilterClause ────────────────────────────────────────────────────

describe('buildNodeFilterClause', () => {
  it('returns empty clause and empty params when no filters', () => {
    const result = buildNodeFilterClause({}, 'n');
    expect(result.clause).toBe('');
    expect(result.params).toEqual({});
  });

  it('nodeLabels: produces label check and sets param', () => {
    const result = buildNodeFilterClause({ nodeLabels: ['Person'] }, 'n');
    expect(result.clause).toContain('labels(n)');
    expect(result.params['filterNodeLabels']).toEqual(['Person']);
  });

  it('nodeLabels: throws on label with space (injection attempt)', () => {
    expect(() =>
      buildNodeFilterClause({ nodeLabels: ['Bad Label'] }, 'n'),
    ).toThrow();
  });

  it('nodeLabels: throws on label with Cypher injection characters', () => {
    expect(() =>
      buildNodeFilterClause({ nodeLabels: ['n) RETURN n //'] }, 'n'),
    ).toThrow();
  });

  it('temporalFilter with gte: produces >= condition and param', () => {
    const date = new Date('2024-01-01');
    const result = buildNodeFilterClause(
      {
        temporalFilters: [
          { field: 'valid_at', op: TemporalComparison.gte, value: date },
        ],
      },
      'n',
    );
    expect(result.clause).toContain('>=');
    expect(result.clause).toContain('valid_at');
    expect(Object.values(result.params)).toContain(date);
  });

  it('isNull: no param added, clause contains IS NULL', () => {
    const result = buildNodeFilterClause(
      {
        temporalFilters: [
          { field: 'invalid_at', op: TemporalComparison.isNull },
        ],
      },
      'n',
    );
    expect(result.clause).toContain('IS NULL');
    expect(Object.keys(result.params)).toHaveLength(0);
  });

  it('mixed labels + temporal: conditions are AND-joined', () => {
    const result = buildNodeFilterClause(
      {
        nodeLabels: ['Person'],
        temporalFilters: [
          { field: 'valid_at', op: TemporalComparison.isNotNull },
        ],
      },
      'n',
    );
    expect(result.clause).toContain(' AND ');
  });
});

// ─── buildEdgeFilterClause ────────────────────────────────────────────────────

describe('buildEdgeFilterClause', () => {
  it('edgeTypes: clause contains name IN $filterEdgeTypes', () => {
    const result = buildEdgeFilterClause({ edgeTypes: ['WORKS_AT'] }, 'e');
    expect(result.clause).toContain('e.name IN $filterEdgeTypes');
    expect(result.params['filterEdgeTypes']).toEqual(['WORKS_AT']);
  });

  it('edgeUuids: clause contains uuid IN $filterEdgeUuids', () => {
    const result = buildEdgeFilterClause({ edgeUuids: ['uuid-1'] }, 'e');
    expect(result.clause).toContain('e.uuid IN $filterEdgeUuids');
    expect(result.params['filterEdgeUuids']).toEqual(['uuid-1']);
  });

  it('multiple filter types: conditions are AND-joined', () => {
    const result = buildEdgeFilterClause(
      { edgeTypes: ['WORKS_AT'], edgeUuids: ['uuid-1'] },
      'e',
    );
    expect(result.clause).toContain(' AND ');
  });

  it('returns empty clause and params when no filters', () => {
    const result = buildEdgeFilterClause({}, 'e');
    expect(result.clause).toBe('');
    expect(result.params).toEqual({});
  });
});
