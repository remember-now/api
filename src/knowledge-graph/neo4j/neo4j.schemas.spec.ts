import { ZodError } from 'zod';

import { GroupIdSchema, NodeLabelsSchema } from './neo4j.schemas';

describe('NodeLabelsSchema', () => {
  it('should pass for a valid single label', () => {
    expect(() => NodeLabelsSchema.parse(['Entity'])).not.toThrow();
  });

  it('should pass for multiple valid labels', () => {
    expect(() => NodeLabelsSchema.parse(['Entity', 'Person'])).not.toThrow();
  });

  it('should pass for labels with underscores and numbers', () => {
    expect(() => NodeLabelsSchema.parse(['My_Label', 'Type2'])).not.toThrow();
  });

  it('should throw ZodError for label with spaces', () => {
    expect(() => NodeLabelsSchema.parse(['Bad Label'])).toThrow(ZodError);
  });

  it('should throw ZodError for Cypher injection attempt', () => {
    expect(() => NodeLabelsSchema.parse(['Entity) WITH n MATCH (x'])).toThrow(
      ZodError,
    );
  });

  it('should throw ZodError for label starting with a digit', () => {
    expect(() => NodeLabelsSchema.parse(['1Invalid'])).toThrow(ZodError);
  });

  it('should throw ZodError for hyphenated label', () => {
    expect(() => NodeLabelsSchema.parse(['bad-label'])).toThrow(ZodError);
  });

  it('should throw ZodError when any label is invalid', () => {
    expect(() =>
      NodeLabelsSchema.parse(['bad-one', 'Entity', 'bad two']),
    ).toThrow(ZodError);
  });

  it('should throw ZodError for empty array', () => {
    expect(() => NodeLabelsSchema.parse([])).toThrow(ZodError);
  });
});

describe('GroupIdSchema', () => {
  it('accepts valid alphanumeric ids', () => {
    expect(() => GroupIdSchema.parse('user123')).not.toThrow();
  });

  it('accepts ids with hyphens and underscores', () => {
    expect(() => GroupIdSchema.parse('user-123')).not.toThrow();
    expect(() => GroupIdSchema.parse('group_a')).not.toThrow();
  });

  it('throws for empty string', () => {
    expect(() => GroupIdSchema.parse('')).toThrow();
  });

  it('throws for id with space', () => {
    expect(() => GroupIdSchema.parse('group id')).toThrow();
  });

  it('throws for id with semicolon', () => {
    expect(() => GroupIdSchema.parse('group;id')).toThrow();
  });

  it('throws for id with newline', () => {
    expect(() => GroupIdSchema.parse('id\n')).toThrow();
  });
});
