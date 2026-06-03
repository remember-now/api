import { buildDedupeEdgesValidator } from './dedupe-edges.prompts';

describe('buildDedupeEdgesValidator', () => {
  const validate = buildDedupeEdgesValidator({
    endpointEdges: [
      { idx: 0, name: 'WORKS_AT', fact: 'A1' },
      { idx: 1, name: 'WORKS_AT', fact: 'A2' },
    ],
    similarEdges: [
      { idx: 2, name: 'EMPLOYED_BY', fact: 'B1' },
      { idx: 3, name: 'EMPLOYED_BY', fact: 'B2' },
    ],
  });

  it('passes valid idx ranges', () => {
    expect(validate({ duplicateFacts: [0, 1], contradictedFacts: [0, 2, 3] })).toEqual(
      [],
    );
  });

  it('passes empty arrays', () => {
    expect(validate({ duplicateFacts: [], contradictedFacts: [] })).toEqual([]);
  });

  it('flags duplicateFacts pointing into similar range', () => {
    expect(
      validate({ duplicateFacts: [2], contradictedFacts: [] }).length,
    ).toBeGreaterThan(0);
  });

  it('flags out-of-range contradictedFacts', () => {
    expect(
      validate({ duplicateFacts: [], contradictedFacts: [99] }).length,
    ).toBeGreaterThan(0);
  });

  it('flags negative idx', () => {
    expect(
      validate({ duplicateFacts: [-1], contradictedFacts: [] }).length,
    ).toBeGreaterThan(0);
  });
});
