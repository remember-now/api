import { NodeNameSchema } from '@/knowledge-graph/types';

import { buildNodeSummaryValidator } from './node-summary.prompts';

const n = (s: string) => NodeNameSchema.parse(s);

describe('buildNodeSummaryValidator', () => {
  const validate = buildNodeSummaryValidator({
    nodes: [{ name: 'Alice' }, { name: 'Bob' }],
  });

  it('passes a well-formed response', () => {
    expect(
      validate({
        summaries: [
          { name: n('Alice'), summary: 'a' },
          { name: n('Bob'), summary: 'b' },
        ],
      }),
    ).toEqual([]);
  });

  it('passes when entries are omitted (intended fallback)', () => {
    expect(validate({ summaries: [{ name: n('Alice'), summary: 'a' }] })).toEqual([]);
  });

  it('flags name not in input set', () => {
    expect(
      validate({
        summaries: [{ name: n('Carol'), summary: 'c' }],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags duplicate names', () => {
    expect(
      validate({
        summaries: [
          { name: n('Alice'), summary: 'a1' },
          { name: n('Alice'), summary: 'a2' },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags case-variant name as not in input set', () => {
    expect(
      validate({
        summaries: [{ name: n('alice'), summary: 'a' }],
      }).length,
    ).toBeGreaterThan(0);
  });
});
