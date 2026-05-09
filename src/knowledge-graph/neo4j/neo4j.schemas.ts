import neo4j from 'neo4j-driver';
import { z } from 'zod';

import { luceneSanitize, toNeo4jDateTime } from './neo4j-utils';

const neoInt = z.int().transform((v) => neo4j.int(v));

// Enums

export enum EpisodeType {
  message = 'message',
  json = 'json',
  text = 'text',
  factTriple = 'fact_triple',
}

export const EpisodeTypeSchema = z.enum(EpisodeType);

// Schemas

export const NodeNameSchema = z.string().min(1).brand<'NodeName'>();

export const NodeLabelSchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    'node label must start with a letter or underscore and contain only alphanumeric characters or underscores',
  )
  .brand<'NodeLabel'>();

export const NodeLabelsSchema = z.array(NodeLabelSchema).min(1);

export const RelationshipTypeSchema = z
  .string()
  .regex(
    /^[A-Z0-9]+(_[A-Z0-9]+)*$/,
    'relationship type must be SCREAMING_SNAKE_CASE (uppercase letters, digits, single underscores between segments)',
  )
  .brand<'RelationshipType'>();

export const GroupIdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'groupId must be non-empty and contain only alphanumeric characters, underscores, or hyphens',
  )
  .brand<'GroupId'>();

export const GraphNameSchema = z.string().min(1).brand<'GraphName'>();

export const UuidSchema = z.uuid().brand<'Uuid'>();

export const SearchByTextParamsSchema = z.object({
  // TODO: Should this string be optional?
  query: z.string().transform((q) => luceneSanitize(q)),
  groupIds: z.array(GroupIdSchema),
  limit: neoInt,
});

export const SearchBySimilarityParamsSchema = z.object({
  embedding: z.array(z.number()),
  groupIds: z.array(GroupIdSchema),
  limit: neoInt,
  minScore: z.number().default(0),
});

export const SearchByBfsParamsSchema = z.object({
  originNodeUuids: z.array(UuidSchema),
  groupIds: z.array(GroupIdSchema),
  limit: neoInt,
  maxDepth: neoInt.optional(),
});

export const GetByGroupIdsParamsSchema = z.object({
  groupIds: z.array(GroupIdSchema),
  limit: neoInt.optional(),
});

export const GetByGroupIdsWithCursorParamsSchema = z.object({
  groupIds: z.array(GroupIdSchema),
  limit: neoInt.optional(),
  uuidCursor: UuidSchema.optional(),
});

export const RetrieveEpisodesParamsSchema = z.object({
  referenceTime: z.date().transform((d) => toNeo4jDateTime(d)),
  lastN: neoInt,
  groupIds: z.array(GroupIdSchema).optional(),
  source: EpisodeTypeSchema.optional(),
  sagaUuid: UuidSchema.optional(),
});

// Types

export type NodeLabel = z.infer<typeof NodeLabelSchema>;
export type NodeLabels = z.infer<typeof NodeLabelsSchema>;
export type NodeName = z.infer<typeof NodeNameSchema>;
export type GroupId = z.infer<typeof GroupIdSchema>;
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;
export type GraphName = z.infer<typeof GraphNameSchema>;
export type Uuid = z.infer<typeof UuidSchema>;
export type SearchByTextParams = z.infer<typeof SearchByTextParamsSchema>;
export type SearchBySimilarityParams = z.infer<
  typeof SearchBySimilarityParamsSchema
>;
export type SearchByBfsParams = z.infer<typeof SearchByBfsParamsSchema>;
export type GetByGroupIdsParams = z.infer<typeof GetByGroupIdsParamsSchema>;
export type GetByGroupIdsWithCursorParams = z.infer<
  typeof GetByGroupIdsWithCursorParamsSchema
>;
export type RetrieveEpisodesParams = z.infer<
  typeof RetrieveEpisodesParamsSchema
>;
