import { NodeNameSchema } from '@/knowledge-graph/types';

import { buildDedupeNodesValidator } from './dedupe-nodes.prompts';

const n = (s: string) => NodeNameSchema.parse(s);

describe('buildDedupeNodesValidator', () => {
  const ctx = {
    extractedNodes: [
      { id: 0, name: 'Alice', labels: ['Entity', 'Person'] },
      { id: 1, name: 'Bob', labels: ['Entity', 'Person'] },
    ],
    candidateNodes: [
      { candidateId: 0, name: 'Alice Smith', labels: ['Entity', 'Person'] },
    ],
  };
  const validate = buildDedupeNodesValidator(ctx);

  it('passes a well-formed response', () => {
    expect(
      validate({
        entityResolutions: [
          { id: 0, name: n('Alice Smith'), duplicateCandidateId: 0 },
          { id: 1, name: n('Bob'), duplicateCandidateId: -1 },
        ],
      }),
    ).toEqual([]);
  });

  it('flags wrong resolution count', () => {
    expect(
      validate({
        entityResolutions: [{ id: 0, name: n('Alice'), duplicateCandidateId: -1 }],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags id not in extracted set', () => {
    expect(
      validate({
        entityResolutions: [
          { id: 0, name: n('Alice'), duplicateCandidateId: -1 },
          { id: 99, name: n('Stranger'), duplicateCandidateId: -1 },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags duplicate id', () => {
    expect(
      validate({
        entityResolutions: [
          { id: 0, name: n('Alice'), duplicateCandidateId: -1 },
          { id: 0, name: n('Alice again'), duplicateCandidateId: -1 },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags invalid duplicateCandidateId (neither -1 nor a real candidate)', () => {
    expect(
      validate({
        entityResolutions: [
          { id: 0, name: n('Alice'), duplicateCandidateId: 42 },
          { id: 1, name: n('Bob'), duplicateCandidateId: -1 },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('flags a name that is neither an extracted nor a candidate name', () => {
    expect(
      validate({
        entityResolutions: [
          { id: 0, name: n('Alice'), duplicateCandidateId: -1 },
          { id: 1, name: n('Robert Paulson'), duplicateCandidateId: -1 },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('accepts a candidate name on a non-duplicate resolution', () => {
    expect(
      validate({
        entityResolutions: [
          { id: 0, name: n('Alice'), duplicateCandidateId: -1 },
          { id: 1, name: n('Alice Smith'), duplicateCandidateId: -1 },
        ],
      }),
    ).toEqual([]);
  });

  it('flags case-variant name as not in allowed set', () => {
    expect(
      validate({
        entityResolutions: [
          { id: 0, name: n('alice'), duplicateCandidateId: -1 },
          { id: 1, name: n('Bob'), duplicateCandidateId: -1 },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });
});
