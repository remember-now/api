import {
  NodeLabelValidationError,
  validateGroupId,
  validateNodeLabels,
} from './neo4j-label-validation';

describe('validateNodeLabels', () => {
  it('should pass for a valid single label', () => {
    expect(() => validateNodeLabels(['Entity'])).not.toThrow();
  });

  it('should pass for multiple valid labels', () => {
    expect(() => validateNodeLabels(['Entity', 'Person'])).not.toThrow();
  });

  it('should pass for labels with underscores and numbers', () => {
    expect(() => validateNodeLabels(['My_Label', 'Type2'])).not.toThrow();
  });

  it('should throw NodeLabelValidationError for label with spaces', () => {
    expect(() => validateNodeLabels(['Bad Label'])).toThrow(
      NodeLabelValidationError,
    );
  });

  it('should throw NodeLabelValidationError for Cypher injection attempt', () => {
    expect(() => validateNodeLabels(['Entity) WITH n MATCH (x'])).toThrow(
      NodeLabelValidationError,
    );
  });

  it('should throw NodeLabelValidationError for label starting with a digit', () => {
    expect(() => validateNodeLabels(['1Invalid'])).toThrow(
      NodeLabelValidationError,
    );
  });

  it('should include the offending label in the error message', () => {
    expect(() => validateNodeLabels(['bad-label'])).toThrow('"bad-label"');
  });

  it('should report all invalid labels when multiple are bad', () => {
    let err: NodeLabelValidationError | undefined;
    try {
      validateNodeLabels(['bad-one', 'Entity', 'bad two']);
    } catch (e) {
      err = e as NodeLabelValidationError;
    }
    expect(err).toBeInstanceOf(NodeLabelValidationError);
    expect(err!.message).toContain('"bad-one"');
    expect(err!.message).toContain('"bad two"');
    expect(err!.message).not.toContain('"Entity"');
  });
});

describe('validateGroupId', () => {
  it('accepts valid alphanumeric ids', () => {
    expect(() => validateGroupId('user123')).not.toThrow();
  });

  it('accepts ids with hyphens and underscores', () => {
    expect(() => validateGroupId('user-123')).not.toThrow();
    expect(() => validateGroupId('group_a')).not.toThrow();
  });

  it('accepts empty string (default group)', () => {
    expect(() => validateGroupId('')).not.toThrow();
  });

  it('throws for id with space', () => {
    expect(() => validateGroupId('group id')).toThrow();
  });

  it('throws for id with semicolon', () => {
    expect(() => validateGroupId('group;id')).toThrow();
  });

  it('throws for id with newline', () => {
    expect(() => validateGroupId('id\n')).toThrow();
  });
});
