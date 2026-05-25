import { z } from 'zod';

import { NodeNameSchema, RelationshipTypeSchema } from '../../types';

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
  fact: z.string(),
  validAt: z.string().nullable().optional(),
  invalidAt: z.string().nullable().optional(),
  episodeIndices: z.array(z.number()).optional(),
});

export const ExtractedEdgesSchema = z.object({
  edges: z.array(ExtractedEdgeSchema),
});

export const TimestampsBatchSchema = z.object({
  facts: z.array(
    z.object({
      validAt: z.string().nullable().optional(),
      invalidAt: z.string().nullable().optional(),
    }),
  ),
});

// Types

export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;
export type ExtractedEdges = z.infer<typeof ExtractedEdgesSchema>;
export type TimestampsBatch = z.infer<typeof TimestampsBatchSchema>;

// JSON Schemas

export const extractedEntitiesJsonSchema = z.toJSONSchema(ExtractedEntitiesSchema);
export const extractedEdgesJsonSchema = z.toJSONSchema(ExtractedEdgesSchema);
export const timestampsBatchJsonSchema = z.toJSONSchema(TimestampsBatchSchema);
