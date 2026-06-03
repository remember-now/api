import { z } from 'zod';

import { NodeNameSchema } from '@/knowledge-graph/types';

import { buildExtractNodesValidator } from './extract-nodes.prompts';

const n = (s: string) => NodeNameSchema.parse(s);

const types = {
  Person: { description: 'a person', schema: z.object({ x: z.string() }) },
  Place: { description: 'a place', schema: z.object({ x: z.string() }) },
};

describe('buildExtractNodesValidator', () => {
  it('passes when no entityTypes provided', () => {
    const validate = buildExtractNodesValidator({});
    expect(
      validate({ extractedEntities: [{ name: n('X'), entityTypeId: 999 }] }),
    ).toEqual([]);
  });

  it('passes valid entityTypeId', () => {
    const validate = buildExtractNodesValidator({ entityTypes: types });
    expect(
      validate({
        extractedEntities: [
          { name: n('Alice'), entityTypeId: 0 },
          { name: n('Denver'), entityTypeId: 1 },
        ],
      }),
    ).toEqual([]);
  });

  it('passes when entityTypeId is omitted', () => {
    const validate = buildExtractNodesValidator({ entityTypes: types });
    expect(validate({ extractedEntities: [{ name: n('Mystery') }] })).toEqual([]);
  });

  it('flags out-of-range entityTypeId', () => {
    const validate = buildExtractNodesValidator({ entityTypes: types });
    expect(
      validate({
        extractedEntities: [{ name: n('Alice'), entityTypeId: 999 }],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags negative entityTypeId', () => {
    const validate = buildExtractNodesValidator({ entityTypes: types });
    expect(
      validate({
        extractedEntities: [{ name: n('Alice'), entityTypeId: -1 }],
      }).length,
    ).toBeGreaterThan(0);
  });
});
