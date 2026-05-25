import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { EdgeTypeMap, EdgeTypeMappings } from '@/knowledge-graph/episode/types';
import { EpisodicNode } from '@/knowledge-graph/models';
import { NodeNameSchema, RelationshipTypeSchema } from '@/knowledge-graph/types';

import { concatenateEpisodes } from '../text-utils';

// Schemas

export const CombinedEntitySchema = z.object({
  name: NodeNameSchema.describe('Name of the extracted entity'),
  entityTypeId: z
    .number()
    .optional()
    .describe(
      'ID of the classified entity type. Must be one of the provided entity_type_id integers. Omit when no provided type fits.',
    ),
});

export const CombinedFactSchema = z.object({
  sourceEntityName: NodeNameSchema.describe(
    'The name of the source entity from the extracted entities list',
  ),
  targetEntityName: NodeNameSchema.describe(
    'The name of the target entity from the extracted entities list',
  ),
  relationType: RelationshipTypeSchema.describe(
    'The type of relationship between the entities, in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, LIVES_IN, IS_FRIENDS_WITH)',
  ),
  fact: z
    .string()
    .describe(
      'A self-contained natural language description of the relationship, paraphrased from the source text with all specific details preserved',
    ),
  validAt: z
    .string()
    .nullable()
    .optional()
    .describe(
      'When the relationship became true. ISO 8601 with Z suffix (e.g., 2025-04-30T00:00:00Z). Set to reference time if ongoing; null if unknown.',
    ),
  invalidAt: z
    .string()
    .nullable()
    .optional()
    .describe(
      'When the relationship stopped being true. ISO 8601 with Z suffix. Set only when explicitly expressed; null otherwise.',
    ),
  episodeIndices: z
    .array(z.number())
    .default([0])
    .describe(
      'List of episode numbers (0-indexed) that this fact was derived from. When processing a single episode, this should be [0].',
    ),
});

export const CombinedExtractionSchema = z.object({
  entities: z.array(CombinedEntitySchema).describe('List of extracted entities'),
  facts: z.array(CombinedFactSchema).describe('List of extracted relationship facts'),
});

export type CombinedEntity = z.infer<typeof CombinedEntitySchema>;
export type CombinedFact = z.infer<typeof CombinedFactSchema>;
export type CombinedExtraction = z.infer<typeof CombinedExtractionSchema>;

export const combinedExtractionJsonSchema = z.toJSONSchema(CombinedExtractionSchema, {
  io: 'input',
});

// Prompt builder

const SYSTEM_PROMPT = `You are an expert knowledge graph builder. In a single pass, extract both entities and the facts (relationships) between them from the provided episodes.

ENTITY EXTRACTION RULES:
- Extract only real-world, nameable entities: people, organisations, places, events, concepts with specific names
- Hobbies and activities count as entities when referenced as meaningful things ("video games", "watercolor painting")
- Possessive constructions: "Nisha's dad" → entity "Nisha's dad", NOT just "dad"
- Qualified specific objects: "wool coat", "dog leash" - not bare generic nouns
- NEVER extract: pronouns, bare kinship terms, unnamed roles, abstract concepts, generic nouns
- Each entity must appear in at least one fact - do not include isolated entities

FACT EXTRACTION RULES:
- Extract one fact per relationship - a complete sentence
- Only extract relationships clearly supported by the episode content
- Skip semantically redundant facts already captured by other facts in this batch
- Self-referencing facts (source = target) are allowed when clearly justified
- Resolve temporal expressions against REFERENCE_TIME; use precise ISO 8601 datetimes

RELATION TYPE RULES:
- If FACT_TYPES are provided and the relationship matches, use that fact_type_name
- Otherwise, derive a relation type in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, MARRIED_TO)

DATETIME RULES:
- validAt: ISO 8601 datetime when the fact became true; set to reference time if ongoing; null if unknown
- invalidAt: ISO 8601 datetime when the fact stopped; set only when explicitly expressed; null otherwise

EPISODE INDICES:
- If multiple episodes are provided (indexed 0, 1, 2, …), populate episodeIndices with the 0-based indices of the episodes that directly support each fact`;

export function buildExtractNodesAndEdgesMessages(ctx: {
  episodes: EpisodicNode[];
  referenceTime: Date;
  entityTypes?: Record<string, { description: string }>;
  edgeTypes?: EdgeTypeMap;
  edgeTypeMappings?: EdgeTypeMappings;
  customInstructions?: string;
}): BaseMessage[] {
  const {
    episodes,
    referenceTime,
    entityTypes,
    edgeTypes,
    edgeTypeMappings,
    customInstructions,
  } = ctx;

  const episodesText =
    episodes.length === 1 ? episodes[0].content : concatenateEpisodes(episodes);

  // Build inverted signatures map: typeName → list of "SourceLabel,TargetLabel" keys
  const edgeTypeSignaturesMap: Record<string, string[]> = {};
  if (edgeTypeMappings) {
    for (const [sig, names] of Object.entries(edgeTypeMappings)) {
      for (const n of names as string[]) {
        (edgeTypeSignaturesMap[n] ??= []).push(sig);
      }
    }
  }

  let humanContent = `REFERENCE TIME: ${referenceTime.toISOString()}\n\nEPISODE CONTENT:\n${episodesText}`;

  if (entityTypes && Object.keys(entityTypes).length > 0) {
    const entityTypesText = Object.entries(entityTypes)
      .map(
        ([label, { description }], index) =>
          `{id: ${index}, label: "${label}", description: "${description}"}`,
      )
      .join('\n');
    humanContent += `\n\nENTITY TYPES:\n${entityTypesText}`;
  }

  if (edgeTypes) {
    const edgeTypesContext = Object.entries(edgeTypes).map(([name, { description }]) => ({
      fact_type_name: name,
      fact_type_signatures: edgeTypeSignaturesMap[name] ?? ['Entity,Entity'],
      fact_type_description: description,
    }));
    humanContent += `\n\n<FACT_TYPES>\n${JSON.stringify(edgeTypesContext, null, 2)}\n</FACT_TYPES>`;
  }

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
