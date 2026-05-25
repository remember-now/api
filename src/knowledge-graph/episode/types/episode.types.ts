import { z } from 'zod';

import { UuidSchema } from '@/common/schemas';

import {
  EntityEdgeSchema,
  EntityNodeSchema,
  EpisodicEdgeSchema,
  EpisodicNodeSchema,
} from '../../models';
import {
  EpisodeTypeSchema,
  NodeLabelSchema,
  NodeNameSchema,
  RelationshipTypeSchema,
} from '../../types';

// Constants

export const PREVIOUS_EPISODES_WINDOW = 20;
export const MAX_NODES_PER_SUMMARY_BATCH = 30;
export const CANDIDATE_LIMIT = 10;

// Schemas

export const EpisodeSchema = z
  .object({
    graphId: UuidSchema,
    name: NodeNameSchema,
    content: z.string().min(1),
    source: EpisodeTypeSchema,
    sourceDescription: z.string().optional(),
    referenceTime: z.date().default(() => new Date()),
    id: UuidSchema.optional(),
    sagaId: UuidSchema.optional(),
  })
  .brand<'Episode'>();

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

export const AddEpisodeOptionsSchema = z.object({
  userId: UuidSchema,
  episodes: z.array(EpisodeSchema).min(1),
  entityTypes: EntityTypeMapSchema.optional(),
  edgeTypes: EdgeTypeMapSchema.optional(),
  edgeTypeMappings: EdgeTypeMappingsSchema.optional(),
  excludedEntityTypes: z.array(NodeLabelSchema).optional(),
  customInstructions: z.string().optional(),
  updateCommunities: z.boolean().optional(),
  useCombinedExtraction: z.boolean().default(false),
});

export const AddEpisodeResultSchema = z.object({
  nodes: z.array(EntityNodeSchema),
  edges: z.array(EntityEdgeSchema),
  invalidatedEdges: z.array(EntityEdgeSchema),
  episodicEdges: z.array(EpisodicEdgeSchema),
  episode: EpisodicNodeSchema,
});

// Types

export type EntityTypeMap = z.infer<typeof EntityTypeMapSchema>;
export type EdgeTypeMap = z.infer<typeof EdgeTypeMapSchema>;
export type EdgeTypeMappings = z.infer<typeof EdgeTypeMappingsSchema>;

export type Episode = z.infer<typeof EpisodeSchema>;
export type AddEpisodeOptionsInput = z.input<typeof AddEpisodeOptionsSchema>;
export type AddEpisodeOptions = z.infer<typeof AddEpisodeOptionsSchema>;
export type AddEpisodeResult = z.infer<typeof AddEpisodeResultSchema>;
