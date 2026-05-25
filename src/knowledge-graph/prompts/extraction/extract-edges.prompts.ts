import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { EdgeTypeMap, EdgeTypeMappings } from '@/knowledge-graph/episode/types';
import { EntityNode, EpisodicNode } from '@/knowledge-graph/models';
import { RelationshipTypeSchema } from '@/knowledge-graph/types';

// Schemas

export const ExtractedEdgeSchema = z.object({
  sourceEntityName: z
    .string()
    .describe('The name of the source entity from the ENTITIES list'),
  targetEntityName: z
    .string()
    .describe('The name of the target entity from the ENTITIES list'),
  relationType: RelationshipTypeSchema.describe(
    'The type of relationship between the entities, in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, LIVES_IN, IS_FRIENDS_WITH)',
  ),
  fact: z
    .string()
    .describe(
      'A natural language description of the relationship between the entities, paraphrased from the source text',
    ),
  validAt: z
    .string()
    .nullable()
    .optional()
    .describe(
      'The date and time when the relationship described by the edge fact became true or was established. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)',
    ),
  invalidAt: z
    .string()
    .nullable()
    .optional()
    .describe(
      'The date and time when the relationship described by the edge fact stopped being true or ended. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)',
    ),
  episodeIndices: z
    .array(z.number())
    .default([0])
    .describe(
      'List of episode numbers (0-indexed) that this fact was derived from. When processing a single episode, this should be [0].',
    ),
});

export const ExtractedEdgesSchema = z.object({
  edges: z.array(ExtractedEdgeSchema).describe('List of extracted relationship facts'),
});

export type ExtractedEdges = z.infer<typeof ExtractedEdgesSchema>;

export const extractedEdgesJsonSchema = z.toJSONSchema(ExtractedEdgesSchema, {
  io: 'input',
});

// Prompt builder

const SYSTEM_PROMPT =
  'You are an expert fact extractor that extracts fact triples from text. ' +
  '1. Extracted fact triples should also be extracted with relevant date information. ' +
  '2. The CURRENT_MESSAGE may contain multiple episodes, each with its own timestamp. ' +
  "Use each episode's timestamp to resolve temporal references within that episode. " +
  'REFERENCE_TIME is a fallback for when no per-episode timestamp is available.';

export function buildExtractEdgesMessages(ctx: {
  episode: EpisodicNode;
  nodes: EntityNode[];
  previousEpisodes: EpisodicNode[];
  referenceTime: Date;
  customInstructions?: string;
  edgeTypes?: EdgeTypeMap;
  edgeTypeMappings?: EdgeTypeMappings;
}): BaseMessage[] {
  const {
    episode,
    nodes,
    previousEpisodes,
    referenceTime,
    customInstructions,
    edgeTypes,
    edgeTypeMappings,
  } = ctx;

  const edgeTypeSignaturesMap: Record<string, string[]> = {};
  if (edgeTypeMappings) {
    for (const [sig, names] of Object.entries(edgeTypeMappings)) {
      for (const n of names as string[]) {
        (edgeTypeSignaturesMap[n] ??= []).push(sig);
      }
    }
  }

  const edgeTypesContext = edgeTypes
    ? Object.entries(edgeTypes).map(([name, { description }]) => ({
        fact_type_name: name,
        fact_type_signatures: edgeTypeSignaturesMap[name] ?? ['Entity,Entity'],
        fact_type_description: description,
      }))
    : [];

  const edgeTypesSection =
    edgeTypesContext.length > 0
      ? `\n<FACT_TYPES>\n${JSON.stringify(edgeTypesContext, null, 2)}\n</FACT_TYPES>\n`
      : '';

  const humanContent = `
<PREVIOUS_MESSAGES>
${JSON.stringify(
  previousEpisodes.map((e) => ({
    name: e.name,
    timestamp: e.validAt.toISOString(),
    content: e.content,
  })),
  null,
  2,
)}
</PREVIOUS_MESSAGES>

<CURRENT_MESSAGE>
${JSON.stringify({ name: episode.name, timestamp: episode.validAt.toISOString(), content: episode.content }, null, 2)}
</CURRENT_MESSAGE>

<ENTITIES>
${JSON.stringify(
  nodes.map((n) => ({ name: n.name, labels: n.labels })),
  null,
  2,
)}
</ENTITIES>

<REFERENCE_TIME>
${referenceTime.toISOString()}  # ISO 8601 (UTC); used to resolve relative time mentions
</REFERENCE_TIME>
${edgeTypesSection}
# TASK
Extract all factual relationships between the given ENTITIES based on the CURRENT MESSAGE.
Only extract facts that:
- involve two DISTINCT ENTITIES from the ENTITIES list,
- are clearly stated or unambiguously implied in the CURRENT MESSAGE,
    and can be represented as edges in a knowledge graph.
- Facts should include entity names rather than pronouns whenever possible.

You may use information from the PREVIOUS MESSAGES only to disambiguate references or support continuity.

${customInstructions ?? ''}

# EXTRACTION RULES

1. **Entity Name Validation**: \`sourceEntityName\` and \`targetEntityName\` must use only the \`name\` values from the ENTITIES list provided above.
   - **CRITICAL**: Using names not in the list will cause the edge to be rejected
2. Each fact must involve two **distinct** entities — \`sourceEntityName\` and \`targetEntityName\` NEVER refer to the same entity.
3. Prefer facts that involve two distinct entities from the ENTITIES list. When a sentence describes a specific, concrete detail about a single entity (a brand name, a specific item, a physical description, a quantity, a location, a named activity), do NOT drop it. Instead, look for a second entity in the ENTITIES list that the detail relates to and form a proper triple (e.g., Entity -> OWNS -> item-entity, Entity -> LIVES_IN -> place-entity, Entity -> HAS_ATTRIBUTE -> detail-entity). Only skip the fact when no second entity in the ENTITIES list can anchor the detail.
   - BAD: "Alice feels happy" (vague single-entity state with no concrete detail — what is Alice happy about?)
   - GOOD: "Alice feels happy about Bob's promotion" → Alice -> FEELS_HAPPY_ABOUT -> Bob's promotion
   - GOOD: "Nate plays games on a Gamecube" → Nate -> PLAYS_GAMES_ON -> Gamecube (when "Gamecube" is in ENTITIES)
   - GOOD: "Alice congratulated Bob" (relationship between two entities), "Alice lives in Paris" (relationship between entity and place)
4. Do not emit semantically redundant facts, even across episodes within the CURRENT_MESSAGE. However, if a later episode adds specific details to a previously stated fact (e.g., adding a brand name, a count, a color, a location, or any concrete attribute), extract the more detailed version as a NEW fact — it is NOT a duplicate. Only treat facts as duplicates when they convey the same specificity.
   - NOT a duplicate: "user plays video games" (Episode 0) vs. "user plays games on a Gamecube" (Episode 1) → extract the second, more detailed fact.
   - IS a duplicate: "user plays games on a Gamecube" (Episode 0) vs. "user plays Gamecube games" (Episode 1) → extract once, list both episodes in \`episodeIndices\`.
5. The \`fact\` MUST preserve all specific details from the source text: proper nouns, brand names, product names, model numbers, quantities, counts, colors, materials, physical descriptions, specific items, named locations, and named activities. Paraphrase the sentence structure but NEVER generalize:
   - NEVER generalize "Gamecube" to "gaming console", "Ford Mustang" to "car", "wool coat" to "coat", "red and purple lighting" to "lighting", "cracked windshield" to "car damage", or "three screenplays" to "several screenplays".
   - Do not verbatim quote the original text, but every concrete noun, number, and descriptor in the source should survive into the \`fact\`.
6. Use \`REFERENCE_TIME\` to resolve vague or relative temporal expressions (e.g., "last week"). When the CURRENT_MESSAGE contains multiple episodes with per-episode timestamps, prefer the timestamp of the specific episode the fact originates from.
7. Do **not** hallucinate or infer temporal bounds from unrelated events.

# RELATION TYPE RULES

- If FACT_TYPES are provided and the relationship matches one of the types (considering the entity type signature), use that fact_type_name as the \`relationType\`.
- Otherwise, derive a \`relationType\` from the relationship predicate in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, LIVES_IN, IS_FRIENDS_WITH).

# DATETIME RULES

- Use ISO 8601 with "Z" suffix (UTC) (e.g., 2025-04-30T00:00:00Z).
- If the fact is ongoing (present tense), set \`validAt\` to the timestamp of the episode the fact originates from. If no per-episode timestamp is available, use REFERENCE_TIME.
- If a change/termination is expressed, set \`invalidAt\` to the relevant timestamp.
- Leave both fields \`null\` if no explicit or resolvable time is stated.
- If only a date is mentioned (no time), assume 00:00:00.
- If only a year is mentioned, use January 1st at 00:00:00.
`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
