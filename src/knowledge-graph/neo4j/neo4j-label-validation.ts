// Pattern matches Cypher safe identifiers (upstream Python: SAFE_CYPHER_IDENTIFIER_PATTERN)
const SAFE_CYPHER_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Pattern matches valid group IDs: alphanumeric, underscore, hyphen
const SAFE_GROUP_ID = /^[a-zA-Z0-9_-]+$/;

export class NodeLabelValidationError extends Error {
  constructor(labels: string[]) {
    super(
      `node_labels must start with a letter or underscore and contain only alphanumeric characters or underscores: ${labels.map((l) => `"${l}"`).join(', ')}`,
    );
  }
}

export function validateNodeLabels(labels: string[]): void {
  const invalid = labels.filter((l) => !SAFE_CYPHER_IDENTIFIER.test(l));
  if (invalid.length > 0) throw new NodeLabelValidationError(invalid);
}

export function validateGroupId(groupId: string): void {
  if (!groupId) return; // empty string is valid (default group)
  if (!SAFE_GROUP_ID.test(groupId)) {
    throw new Error(
      `Invalid groupId "${groupId}": only alphanumeric, underscore, and hyphen allowed`,
    );
  }
}
