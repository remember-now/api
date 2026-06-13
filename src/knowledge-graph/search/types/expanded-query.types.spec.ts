import {
  ExpandedQuerySchema,
  SearchGroupSchema,
  SubQueryType,
} from './expanded-query.types';
import { MAX_RESULTS_PER_GROUP } from './search-config.types';

describe('ExpandedQuerySchema', () => {
  it('accepts a lex query using OR, a quoted phrase, and negation', () => {
    const result = ExpandedQuerySchema.safeParse({
      type: SubQueryType.lex,
      text: 'frogs OR amphibians "pretty dumb" -dogs',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a lex query containing a newline', () => {
    const result = ExpandedQuerySchema.safeParse({
      type: SubQueryType.lex,
      text: 'frogs\nopinion',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a lex query with an unbalanced quote', () => {
    const result = ExpandedQuerySchema.safeParse({
      type: SubQueryType.lex,
      text: 'frogs "pretty dumb',
    });
    expect(result.success).toBe(false);
  });

  it.each([SubQueryType.vec, SubQueryType.hyde])(
    'rejects %s queries that use negation',
    (type) => {
      const result = ExpandedQuerySchema.safeParse({ type, text: 'frogs -dogs' });
      expect(result.success).toBe(false);
    },
  );

  it.each([SubQueryType.vec, SubQueryType.hyde])('accepts a plain %s query', (type) => {
    const result = ExpandedQuerySchema.safeParse({
      type,
      text: 'what do I think of frogs',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty text', () => {
    const result = ExpandedQuerySchema.safeParse({ type: SubQueryType.lex, text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown sub-query type', () => {
    const result = ExpandedQuerySchema.safeParse({ type: 'fuzzy', text: 'frogs' });
    expect(result.success).toBe(false);
  });
});

describe('SearchGroupSchema', () => {
  it('accepts an original query, at least one sub-query, and a limit', () => {
    const result = SearchGroupSchema.safeParse({
      originalQuery: 'what do I think of frogs',
      queries: [{ type: SubQueryType.lex, text: 'frogs' }],
      limit: 8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty queries array', () => {
    const result = SearchGroupSchema.safeParse({
      originalQuery: 'frogs',
      queries: [],
      limit: 8,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing original query', () => {
    const result = SearchGroupSchema.safeParse({
      queries: [{ type: SubQueryType.lex, text: 'frogs' }],
      limit: 8,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an input whose sub-query fails validation', () => {
    const result = SearchGroupSchema.safeParse({
      originalQuery: 'frogs',
      queries: [{ type: SubQueryType.vec, text: 'frogs -dogs' }],
      limit: 8,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a limit below 1', () => {
    const result = SearchGroupSchema.safeParse({
      originalQuery: 'frogs',
      queries: [{ type: SubQueryType.lex, text: 'frogs' }],
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a limit above the guardrail ceiling', () => {
    const result = SearchGroupSchema.safeParse({
      originalQuery: 'frogs',
      queries: [{ type: SubQueryType.lex, text: 'frogs' }],
      limit: MAX_RESULTS_PER_GROUP + 1,
    });
    expect(result.success).toBe(false);
  });
});
