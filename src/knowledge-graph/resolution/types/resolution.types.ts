import { z } from 'zod';

import { UuidSchema } from '@/common/schemas';

import { EntityEdgeSchema, EntityNodeSchema } from '../../models';

// Schemas

export const EdgeResolutionResultSchema = z.object({
  resolvedEdges: z.array(EntityEdgeSchema),
  invalidatedEdges: z.array(EntityEdgeSchema),
  // Subset of resolvedEdges that were freshly extracted (not duplicates of
  // existing graph edges). Attribute extraction runs only on these to avoid
  // overwriting prior values when an existing edge is matched as a duplicate.
  newEdges: z.array(EntityEdgeSchema),
});

export const NodeResolutionResultSchema = z.object({
  resolvedNodes: z.array(EntityNodeSchema),
  idMap: z.map(UuidSchema, UuidSchema),
  duplicatePairs: z.array(z.object({ extractedId: UuidSchema, canonicalId: UuidSchema })),
});

// Types

export type EdgeResolutionResult = z.infer<typeof EdgeResolutionResultSchema>;
export type NodeResolutionResult = z.infer<typeof NodeResolutionResultSchema>;
