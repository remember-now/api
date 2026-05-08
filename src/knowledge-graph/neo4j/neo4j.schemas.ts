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

// Schemas

export const NodeLabelSchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    'node label must start with a letter or underscore and contain only alphanumeric characters or underscores',
  );

export const NodeLabelsSchema = z.array(NodeLabelSchema).min(1);

export const GroupIdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'groupId must be non-empty and contain only alphanumeric characters, underscores, or hyphens',
  )
  .brand<'GroupId'>();

export const GraphNameSchema = z.string().min(1).brand<'GraphName'>();

export const UuidSchema = z.uuid().brand<'Uuid'>();
export const UuidArraySchema = z.array(UuidSchema);

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

const episodeTypeValues = Object.values(EpisodeType) as [
  EpisodeType,
  ...EpisodeType[],
];

export const RetrieveEpisodesParamsSchema = z.object({
  referenceTime: z.date().transform((d) => toNeo4jDateTime(d)),
  lastN: neoInt,
  groupIds: z.array(GroupIdSchema).optional(),
  source: z.enum(episodeTypeValues).optional(),
  sagaUuid: UuidSchema.optional(),
});

// Types

export type GroupId = z.infer<typeof GroupIdSchema>;
export type GraphName = z.infer<typeof GraphNameSchema>;
export type Uuid = z.infer<typeof UuidSchema>;
export type UuidArray = z.infer<typeof UuidArraySchema>;
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
