import { z } from 'zod';

import { NodeNameSchema } from '../../neo4j';

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

// Types

export type NodeResolutions = z.infer<typeof NodeResolutionsSchema>;
export type EdgeDedupe = z.infer<typeof EdgeDedupeSchema>;

// JSON Schemas

export const nodeResolutionsJsonSchema = z.toJSONSchema(NodeResolutionsSchema);
export const edgeDedupeJsonSchema = z.toJSONSchema(EdgeDedupeSchema);
