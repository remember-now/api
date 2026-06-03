import { NodeNameSchema } from '@/knowledge-graph/types';

import { buildResolveNameCollisionsValidator } from './resolve-name-collisions.prompts';

const n = (s: string) => NodeNameSchema.parse(s);

describe('buildResolveNameCollisionsValidator', () => {
  const colliders = [
    { tempId: 0, summary: 'A' },
    { tempId: 1, summary: 'B' },
  ];
  const namesInUse = ['Denver tech meetup'];
  const validate = buildResolveNameCollisionsValidator({ colliders, namesInUse });

  it('passes a well-formed response', () => {
    expect(
      validate({
        resolutions: [
          { tempId: 0, name: n('Ceramics at Belmont') },
          { tempId: 1, name: n('Greenpoint Clay') },
        ],
      }),
    ).toEqual([]);
  });

  it('flags wrong resolution count', () => {
    expect(
      validate({ resolutions: [{ tempId: 0, name: n('Solo') }] }).length,
    ).toBeGreaterThan(0);
  });

  it('flags tempId not in input set', () => {
    expect(
      validate({
        resolutions: [
          { tempId: 0, name: n('A label') },
          { tempId: 42, name: n('B label') },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags duplicate tempId', () => {
    expect(
      validate({
        resolutions: [
          { tempId: 0, name: n('One label') },
          { tempId: 0, name: n('Two label') },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags collision with NAMES IN USE (case-insensitive)', () => {
    expect(
      validate({
        resolutions: [
          { tempId: 0, name: n('denver tech meetup') },
          { tempId: 1, name: n('Other label') },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags duplicate names across resolutions (case-insensitive)', () => {
    expect(
      validate({
        resolutions: [
          { tempId: 0, name: n('Shared label') },
          { tempId: 1, name: n('shared label') },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });
});
