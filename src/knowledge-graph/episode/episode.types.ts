import { z } from 'zod';

import {
  EntityEdgeSchema,
  EntityNodeSchema,
  EpisodicEdgeSchema,
  EpisodicNodeSchema,
} from '../models';
import {
  EpisodeTypeSchema,
  GroupIdSchema,
  NodeLabelSchema,
  NodeNameSchema,
  RelationshipTypeSchema,
  UuidSchema,
} from '../neo4j';

// Schemas

export const EpisodeSchema = z
  .object({
    groupId: GroupIdSchema,
    name: NodeNameSchema,
    content: z.string().min(1),
    source: EpisodeTypeSchema,
    sourceDescription: z.string().optional(),
    referenceTime: z.date().default(() => new Date()),
    uuid: UuidSchema.optional(),
    sagaUuid: UuidSchema.optional(),
  })
  .brand<'Episode'>();

export const NodeSummarySchema = z.object({
  summaries: z.array(
    z.object({
      uuid: UuidSchema,
      summary: z.string(),
    }),
  ),
});

export const EntityTypeMapSchema = z.record(
  NodeLabelSchema,
  z.object({
    description: z.string(),
    schema: z.instanceof(z.ZodType),
  }),
);
export const EdgeTypeMapSchema = z.record(
  RelationshipTypeSchema,
  z.object({
    description: z.string(),
    schema: z.instanceof(z.ZodType),
  }),
);

export const EdgeTypeMappingsSchema = z.map(
  z.tuple([NodeLabelSchema, NodeLabelSchema]),
  z.array(RelationshipTypeSchema),
);

export const BaseEpisodeOptionsSchema = z.object({
  userId: z.number(),
  entityTypes: EntityTypeMapSchema.optional(),
  edgeTypes: EdgeTypeMapSchema.optional(),
  edgeTypeMappings: EdgeTypeMappingsSchema.optional(),
  excludedEntityTypes: z.array(NodeLabelSchema).optional(),
  customInstructions: z.string().optional(),
  updateCommunities: z.boolean().optional(),
});

export const BaseEpisodeResultSchema = z.object({
  nodes: z.array(EntityNodeSchema),
  edges: z.array(EntityEdgeSchema),
  invalidatedEdges: z.array(EntityEdgeSchema),
  episodicEdges: z.array(EpisodicEdgeSchema),
});

export const AddEpisodeOptionsSchema = BaseEpisodeOptionsSchema.extend({
  episode: EpisodeSchema,
});

export const AddEpisodeResultSchema = BaseEpisodeResultSchema.extend({
  episode: EpisodicNodeSchema,
});

// Types

export type NodeSummary = z.infer<typeof NodeSummarySchema>;
export type EntityTypeMap = z.infer<typeof EntityTypeMapSchema>;
export type EdgeTypeMap = z.infer<typeof EdgeTypeMapSchema>;
export type EdgeTypeMappings = z.infer<typeof EdgeTypeMappingsSchema>;

export type Episode = z.infer<typeof EpisodeSchema>;
export type AddEpisodeOptionsInput = z.input<typeof AddEpisodeOptionsSchema>;
export type AddEpisodeOptions = z.infer<typeof AddEpisodeOptionsSchema>;
export type AddEpisodeResult = z.infer<typeof AddEpisodeResultSchema>;

// JSON Schemas

export const nodeSummaryJsonSchema = z.toJSONSchema(NodeSummarySchema);
