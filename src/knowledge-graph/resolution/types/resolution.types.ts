import { z } from 'zod';

import { EntityEdgeSchema, EntityNodeSchema } from '../../models';
import { NodeNameSchema, UuidSchema } from '../../neo4j';

// Schemas

export const NodeResolutionSchema = z.object({
  id: z.number(),
  name: NodeNameSchema,
  duplicate_name: NodeNameSchema,
});

export const NodeResolutionsSchema = z.object({
  entity_resolutions: z.array(NodeResolutionSchema),
});

export const EdgeDedupeSchema = z.object({
  duplicate_facts: z.array(z.number()),
  contradicted_facts: z.array(z.number()),
});

export const EdgeResolutionResultSchema = z.object({
  resolvedEdges: z.array(EntityEdgeSchema),
  invalidatedEdges: z.array(EntityEdgeSchema),
});

export const NodeResolutionResultSchema = z.object({
  resolvedNodes: z.array(EntityNodeSchema),
  uuidMap: z.map(UuidSchema, UuidSchema),
  duplicatePairs: z.array(
    z.object({ extractedUuid: UuidSchema, canonicalUuid: UuidSchema }),
  ),
});

// Types

export type NodeResolutions = z.infer<typeof NodeResolutionsSchema>;
export type EdgeDedupe = z.infer<typeof EdgeDedupeSchema>;
export type EdgeResolutionResult = z.infer<typeof EdgeResolutionResultSchema>;
export type NodeResolutionResult = z.infer<typeof NodeResolutionResultSchema>;

// JSON Schemas

export const nodeResolutionsJsonSchema = z.toJSONSchema(NodeResolutionsSchema);
export const edgeDedupeJsonSchema = z.toJSONSchema(EdgeDedupeSchema);
