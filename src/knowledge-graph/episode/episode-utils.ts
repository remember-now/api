import { NodeLabel, NodeLabels, NodeLabelSchema, RelationshipType } from '../neo4j';
import { EdgeTypeMap, EdgeTypeMappings } from './episode.types';

/**
 * Returns the subset of `edgeTypes` that are valid for the given source/target
 * label combination, as determined by `edgeTypeMap`.
 *
 * `edgeTypeMap` keys are `"SourceLabel,TargetLabel"` strings. For each
 * combination of source and target labels, the map yields edge type names whose
 * definitions are then looked up in `edgeTypes`. Duplicates are deduplicated
 * (first occurrence wins).
 *
 * @example
 * // sourceLabels: ['Person'], targetLabels: ['Company']
 * // edgeTypeMap:  { 'Person,Company': ['WORKS_AT', 'FOUNDED'] }
 * // edgeTypes:    { WORKS_AT: { description: '...', schema: ... }, FOUNDED: { ... } }
 * // → { WORKS_AT: { description: '...', schema: ... }, FOUNDED: { ... } }
 */
export function getApplicableEdgeTypes(
  sourceLabels: NodeLabels,
  targetLabels: NodeLabels,
  edgeTypes: EdgeTypeMap,
  edgeTypeMappings: EdgeTypeMappings,
): EdgeTypeMap {
  const result: EdgeTypeMap = {};

  for (const src of sourceLabels) {
    for (const tgt of targetLabels) {
      const key: [NodeLabel, NodeLabel] = [src, tgt];

      for (const typeName of edgeTypeMappings.get(key) ?? []) {
        const typeDef = edgeTypes[typeName];
        if (typeDef && !(typeName in result)) result[typeName] = typeDef;
      }
    }
  }
  return result;
}

export function getEffectiveTypeMappings(
  edgeTypeMappings?: EdgeTypeMappings,
  edgeTypes?: EdgeTypeMap,
): EdgeTypeMappings | undefined {
  let effectiveEdgeTypeMappings = edgeTypeMappings;

  if (!edgeTypeMappings && edgeTypes) {
    const defaultKey: [NodeLabel, NodeLabel] = [
      NodeLabelSchema.parse('Entity'),
      NodeLabelSchema.parse('Entity'),
    ];
    effectiveEdgeTypeMappings = new Map();

    effectiveEdgeTypeMappings.set(
      defaultKey,
      Object.keys(edgeTypes) as RelationshipType[],
    );
  }
  return effectiveEdgeTypeMappings;
}
