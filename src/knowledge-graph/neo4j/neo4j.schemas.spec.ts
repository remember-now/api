import { ZodError } from 'zod';

import {
  GroupIdSchema,
  NodeLabelsSchema,
  RelationshipTypeSchema,
} from './neo4j.schemas';

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

describe('RelationshipTypeSchema', () => {
  it('accepts a single-segment type', () => {
    expect(() => RelationshipTypeSchema.parse('KNOWS')).not.toThrow();
  });

  it('accepts a multi-segment type', () => {
    expect(() => RelationshipTypeSchema.parse('HAS_PROPERTY')).not.toThrow();
    expect(() => RelationshipTypeSchema.parse('RELATED_TO')).not.toThrow();
  });

  it('accepts types with digits', () => {
    expect(() => RelationshipTypeSchema.parse('A1_B2')).not.toThrow();
  });

  it('throws ZodError for lowercase', () => {
    expect(() => RelationshipTypeSchema.parse('knows')).toThrow(ZodError);
    expect(() => RelationshipTypeSchema.parse('has_property')).toThrow(
      ZodError,
    );
  });

  it('throws ZodError for mixed case', () => {
    expect(() => RelationshipTypeSchema.parse('Has_Property')).toThrow(
      ZodError,
    );
  });

  it('throws ZodError for leading underscore', () => {
    expect(() => RelationshipTypeSchema.parse('_KNOWS')).toThrow(ZodError);
  });

  it('throws ZodError for trailing underscore', () => {
    expect(() => RelationshipTypeSchema.parse('KNOWS_')).toThrow(ZodError);
  });

  it('throws ZodError for double underscore', () => {
    expect(() => RelationshipTypeSchema.parse('HAS__PROPERTY')).toThrow(
      ZodError,
    );
  });

  it('throws ZodError for empty string', () => {
    expect(() => RelationshipTypeSchema.parse('')).toThrow(ZodError);
  });

  it('throws ZodError for type with spaces', () => {
    expect(() => RelationshipTypeSchema.parse('HAS PROPERTY')).toThrow(
      ZodError,
    );
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
