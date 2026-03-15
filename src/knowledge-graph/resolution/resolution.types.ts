import { z } from 'zod';

export const NodeResolutionSchema = z.object({
  id: z.number(),
  name: z.string(),
  duplicate_name: z.string(),
});

export const NodeResolutionsSchema = z.object({
  entity_resolutions: z.array(NodeResolutionSchema),
});

export type NodeResolutions = z.infer<typeof NodeResolutionsSchema>;
export const nodeResolutionsJsonSchema = z.toJSONSchema(NodeResolutionsSchema);

export const EdgeDedupeSchema = z.object({
  duplicate_facts: z.array(z.number()),
  contradicted_facts: z.array(z.number()),
});

export type EdgeDedupe = z.infer<typeof EdgeDedupeSchema>;
export const edgeDedupeJsonSchema = z.toJSONSchema(EdgeDedupeSchema);
