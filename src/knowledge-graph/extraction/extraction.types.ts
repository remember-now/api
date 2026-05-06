import { z } from 'zod';

// Schemas

export const ExtractedEntitySchema = z.object({
  name: z.string(),
  entityTypeId: z.number().optional(),
});

export const ExtractedEntitiesSchema = z.object({
  extractedEntities: z.array(ExtractedEntitySchema),
});

export const ExtractedEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  name: z.string(),
  description: z.string(),
  validAt: z.string().nullable().optional(),
  invalidAt: z.string().nullable().optional(),
});

export const ExtractedEdgesSchema = z.object({
  edges: z.array(ExtractedEdgeSchema),
});

// Types

export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;
export type ExtractedEdges = z.infer<typeof ExtractedEdgesSchema>;

// JSON Schemas

export const extractedEntitiesJsonSchema = z.toJSONSchema(
  ExtractedEntitiesSchema,
);
export const extractedEdgesJsonSchema = z.toJSONSchema(ExtractedEdgesSchema);
