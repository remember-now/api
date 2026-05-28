import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { EdgeTypeMap, EdgeTypeMappings } from '@/knowledge-graph/episode/types';
import { EntityNode, EpisodicNode } from '@/knowledge-graph/models';
import { RelationshipTypeSchema } from '@/knowledge-graph/types';

import {
  formatCurrentEpisode,
  formatPreviousEpisodes,
  formatPromptTimestamp,
} from '../text-utils';

// Schema

// TODO: Too much cognitive load for a model
const ExtractedEdgeSchema = z.object({
  sourceEntityName: z
    .string()
    .describe('The name of the source entity from the ENTITIES list'),
  targetEntityName: z
    .string()
    .describe('The name of the target entity from the ENTITIES list'),
  // TODO: This is where the model creates new relationship types. Unlike
  // extract-nodes (which forces the model to pick an entityTypeId from a
  // provided list), edges accept any SCREAMING_SNAKE_CASE name the model
  // derives from the predicate when no provided FACT TYPE matches. Kept soft
  // by design - tightening would require dropping support for novel relations.
  relationType: RelationshipTypeSchema.describe(
    'The type of relationship between the entities, in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, LIVES_IN, IS_FRIENDS_WITH)',
  ),
  fact: z
    .string()
    .describe(
      'A natural language description of the relationship between the entities, paraphrased from the source text',
    ),
  validAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe(
      'The date and time when the relationship described by the edge fact became true or was established. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)',
    ),
  invalidAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe(
      'The date and time when the relationship described by the edge fact stopped being true or ended. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)',
    ),
  // TODO: Multi-episode extraction per prompt
  // episodeIndices: z
  //   .array(z.number())
  //   .default([0])
  //   .describe(
  //     'List of episode numbers (0-indexed) that this fact was derived from. When processing a single episode, this should be [0].',
  //   ),
});

export const ExtractedEdgesSchema = z.object({
  edges: z.array(ExtractedEdgeSchema).describe('List of extracted relationship facts'),
});

// Prompt builder

const SYSTEM_PROMPT = `You are an expert fact extractor. Extract factual relationships (edges)
between the given ENTITIES from the CURRENT EPISODE.

Primary goal:
Extract every clearly stated or unambiguously implied relationship between two DISTINCT entities
from the ENTITIES list that can be represented as an edge in a knowledge graph, paraphrased from
the source text with all specific details preserved, and annotated with relevant date information.

Source rules:
- Only use facts grounded in the CURRENT EPISODE. The CURRENT EPISODE may contain multiple
episodes, each with its own timestamp.
- Use PREVIOUS EPISODES only to disambiguate references or support continuity, never as a source
of new facts.
- Use each episode's timestamp to resolve temporal references within that episode. REFERENCE TIME
is a fallback for when no per-episode timestamp is available.

EXTRACTION RULES:

1. Entity Name Validation: 'sourceEntityName' and 'targetEntityName' MUST use only the 'name'
values from the ENTITIES list provided in the human message.
   - CRITICAL: Using names not in the list will cause the edge to be rejected.
2. Each fact must involve two DISTINCT entities - 'sourceEntityName' and 'targetEntityName' NEVER
refer to the same entity.
3. Prefer facts that involve two distinct entities from the ENTITIES list. When a sentence
describes a specific, concrete detail about a single entity (a brand name, a specific item, a
physical description, a quantity, a location, a named activity), do NOT drop it. Instead, look for
a second entity in the ENTITIES list that the detail relates to and form a proper edge (e.g.,
Entity -> OWNS -> item-entity, Entity -> LIVES_IN -> place-entity,
Entity -> HAS_ATTRIBUTE -> detail-entity). Only skip the fact when no second entity in the
ENTITIES list can anchor the detail.
   - BAD: "Alice feels happy" (vague single-entity state with no concrete detail - what is Alice happy about?)
   - GOOD: "Alice feels happy about Bob's promotion" -> Alice -> FEELS_HAPPY_ABOUT -> Bob's promotion
   - GOOD: "Nate plays games on a Gamecube" -> Nate -> PLAYS_GAMES_ON -> Gamecube (when "Gamecube" is in ENTITIES)
   - GOOD: "Alice congratulated Bob" (relationship between two entities), "Alice lives in Paris" (relationship between entity and place)
4. Do not emit semantically redundant facts, even across episodes within the CURRENT EPISODE.
However, if a later episode adds specific details to a previously stated fact (e.g., adding a brand
name, a count, a color, a location, or any concrete attribute), extract the more detailed version
as a NEW fact - it is NOT a duplicate. Only treat facts as duplicates when they convey the same
specificity.
   - NOT a duplicate: "user plays video games" (Episode 0)
   vs. "user plays games on a Gamecube" (Episode 1) -> extract the second, more detailed fact.
   - IS a duplicate: "user plays games on a Gamecube" (Episode 0)
   vs. "user plays Gamecube games" (Episode 1) -> extract once, list both episodes in 'episodeIndices'.
5. The 'fact' MUST preserve all specific details from the source text: proper nouns, brand names,
product names, model numbers, quantities, counts, colors, materials, physical descriptions,
specific items, named locations, and named activities. Paraphrase the sentence structure but NEVER
generalize:
   - NEVER generalize "Gamecube" to "gaming console", "Ford Mustang" to "car", "wool coat" to
"coat", "red and purple lighting" to "lighting", "cracked windshield" to "car damage", or "three
screenplays" to "several screenplays".
   - Do not verbatim quote the original text, but every concrete noun, number, and descriptor in
the source should survive into the 'fact'.
6. Facts should include entity names rather than pronouns whenever possible.
7. NEVER hallucinate or infer temporal bounds from unrelated events.

RELATION TYPE RULES:

- If FACT TYPES are provided and the relationship matches one of the types (considering the entity
type signature), use that factTypeName as the 'relationType'.
- Otherwise, derive a 'relationType' from the relationship predicate in SCREAMING_SNAKE_CASE
(e.g., WORKS_AT, LIVES_IN, IS_FRIENDS_WITH).

DATETIME RULES:

- Use ISO 8601 with "Z" suffix (UTC) (e.g., 2025-04-30T00:00:00Z).
- If the fact is ongoing (present tense), set 'validAt' to the timestamp of the episode the fact
originates from. If no per-episode timestamp is available, use REFERENCE TIME.
- If a change/termination is expressed, set 'invalidAt' to the relevant timestamp.
- Leave both fields null if no explicit or resolvable time is stated.
- If only a date is mentioned (no time), assume 00:00:00.
- If only a year is mentioned, use January 1st at 00:00:00.
- Use REFERENCE TIME to resolve vague or relative temporal expressions (e.g., "last week"). When
the CURRENT EPISODE contains multiple episodes with per-episode timestamps, prefer the timestamp
of the specific episode the fact originates from.`;

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
        factTypeName: name,
        factTypeSignatures: edgeTypeSignaturesMap[name] ?? ['Entity,Entity'],
        factTypeDescription: description,
      }))
    : [];

  let humanContent = `Apply every rule from the system instructions when extracting facts from the CURRENT EPISODE below.

<PREVIOUS EPISODES>
${formatPreviousEpisodes(previousEpisodes)}
</PREVIOUS EPISODES>

<CURRENT EPISODE>
${formatCurrentEpisode(episode)}
</CURRENT EPISODE>

<ENTITIES>
${JSON.stringify(
  nodes.map((n) => ({ name: n.name, labels: n.labels })),
  null,
  2,
)}
</ENTITIES>

<REFERENCE TIME>
${formatPromptTimestamp(referenceTime)}  # ISO 8601 (UTC); used to resolve relative time mentions
</REFERENCE TIME>`;

  if (edgeTypesContext.length > 0) {
    humanContent += `

<FACT TYPES>
${JSON.stringify(edgeTypesContext, null, 2)}
</FACT TYPES>`;
  }

  if (customInstructions) {
    humanContent += `\n\n<CUSTOM INSTRUCTIONS>\n${customInstructions}\n</CUSTOM INSTRUCTIONS>`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}

// Per-edge timestamp fallback
//
// The main edge-extraction prompt above already emits validAt/invalidAt
// inline on every edge. This second prompt is a single-edge fallback for
// edges where the batch pass returned both fields as null - we re-ask the
// model with just one fact and a reference time, which is cheaper and gives
// the model less to juggle.
//
// Mirrors graphiti's `extract_edges.extract_timestamps` (Python
// `graphiti_core/prompts/extract_edges.py`) called from
// `edge_operations.py:_extract_edge_timestamps`. Caller:
// `EpisodeService.extractEdgeTimestampsFallback`.

export const EdgeTimestampsSchema = z.object({
  validAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe(
      'When the fact became true. ISO 8601 with Z suffix (e.g., 2025-04-30T00:00:00Z). Null if no temporal information.',
    ),
  invalidAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe(
      'When the fact stopped being true. ISO 8601 with Z suffix (e.g., 2025-04-30T00:00:00Z). Null if ongoing or unknown.',
    ),
});

const TIMESTAMPS_FALLBACK_SYSTEM_PROMPT = `You extract temporal bounds from facts. NEVER hallucinate dates.

Given a FACT and its REFERENCE TIME, determine when the fact became true
(validAt) and when it stopped being true (invalidAt).

Rules:
- Resolve relative expressions ("last week", "2 years ago", "yesterday") using REFERENCE TIME.
- If the fact is ongoing (present tense), set validAt to REFERENCE TIME.
- If a change or end is expressed, set invalidAt to the relevant time.
- Leave both null if no time is stated or resolvable.
- If only a date is mentioned (no time), assume 00:00:00.
- Use ISO 8601 with Z suffix (e.g., 2025-04-30T00:00:00Z).
- Do NOT hallucinate or infer dates from unrelated events.`;

export function buildExtractTimestampsMessages(ctx: {
  fact: string;
  referenceTime: Date;
}): BaseMessage[] {
  const { fact, referenceTime } = ctx;

  const humanContent = `Apply every rule from the system instructions when extracting timestamps for the fact below.

<FACT>
${fact}
</FACT>

<REFERENCE TIME>
${formatPromptTimestamp(referenceTime)}
</REFERENCE TIME>`;

  return [
    new SystemMessage(TIMESTAMPS_FALLBACK_SYSTEM_PROMPT),
    new HumanMessage(humanContent),
  ];
}
