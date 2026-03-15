import { z } from 'zod';

export const NodeResolutionSchema = z.object({
  uuid: z.string(),
  duplicate_of: z.string().nullable(),
});

export const NodeResolutionsSchema = z.object({
  entity_resolutions: z.array(NodeResolutionSchema),
});

export type NodeResolutions = z.infer<typeof NodeResolutionsSchema>;
export const nodeResolutionsJsonSchema = z.toJSONSchema(NodeResolutionsSchema);

export const EdgeDedupeSchema = z.object({
  duplicate_fact_uuids: z.array(z.string()),
  contradicted_fact_uuids: z.array(z.string()),
});

export type EdgeDedupe = z.infer<typeof EdgeDedupeSchema>;
export const edgeDedupeJsonSchema = z.toJSONSchema(EdgeDedupeSchema);
