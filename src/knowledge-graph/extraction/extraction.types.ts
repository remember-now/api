import { z } from 'zod';

import { NodeNameSchema, RelationshipTypeSchema } from '../neo4j';

// Schemas

export const ExtractedEntitySchema = z.object({
  name: NodeNameSchema,
  entityTypeId: z.number().optional(),
});

export const ExtractedEntitiesSchema = z.object({
  extractedEntities: z.array(ExtractedEntitySchema),
});

export const ExtractedEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  name: RelationshipTypeSchema,
  description: z.string(),
  validAt: z.string().nullable().optional(),
  invalidAt: z.string().nullable().optional(),
  episodeIndices: z.array(z.number()).optional(),
});

export const ExtractedEdgesSchema = z.object({
  edges: z.array(ExtractedEdgeSchema),
});

// Types

export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;
export type ExtractedEdges = z.infer<typeof ExtractedEdgesSchema>;

// JSON Schemas

export const extractedEntitiesJsonSchema = z.toJSONSchema(ExtractedEntitiesSchema);
export const extractedEdgesJsonSchema = z.toJSONSchema(ExtractedEdgesSchema);
