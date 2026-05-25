import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { EdgeTypeMap, EdgeTypeMappings } from '@/knowledge-graph/episode/types';
import { EntityNode, EpisodicNode } from '@/knowledge-graph/models';

import { formatPreviousEpisodes } from '../text-utils';

const SYSTEM_PROMPT = `You are an expert at extracting relationships between entities from text.

Your task is to identify meaningful relationships between the provided entities and express them as edges in a knowledge graph.

Rules:
- Only use entity names from the provided entities list — the "source" and "target" fields must match the entity name exactly (a source/target not in the list causes the edge to be rejected)
- Extract one fact per edge — a complete sentence describing the relationship
- Only extract relationships clearly supported by the episode content
- Do not infer or hallucinate relationships not present in the text
- Skip semantically redundant facts already captured by other edges in this batch
- Self-referencing facts (source entity = target entity) are allowed when clearly justified, but two-entity facts are preferred
- Resolve temporal expressions ("last year", "recently") against REFERENCE_TIME

DETAIL PRESERVATION:
- The "fact" MUST preserve every specific detail from the source text: proper nouns, brand names, product names, model numbers, quantities, counts, colours, materials, physical descriptors, named locations, and named activities
- NEVER generalise: "Gamecube" → "gaming console", "Ford Mustang" → "car", "wool coat" → "coat", "red and purple lighting" → "lighting", "cracked windshield" → "car damage", "three screenplays" → "several screenplays"
- Paraphrase sentence structure but every concrete noun, number, and descriptor in the source must survive into the fact

RELATION TYPE RULES:
- If FACT_TYPES are provided and the relationship matches one of the types (considering the entity type signature), use that fact_type_name as the relation type
- Otherwise, derive a relation type in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, MARRIED_TO, FOUNDED_BY)

DATETIME RULES:
- Use ISO 8601 with a "Z" suffix (UTC), e.g. 2025-04-30T00:00:00Z
- If only a date is mentioned (no time), assume 00:00:00
- If only a year is mentioned, use January 1st at 00:00:00
- validAt: when the fact became true; if the fact appears ongoing, set to REFERENCE_TIME; null if no temporal information is present
- invalidAt: when the fact stopped being true; set only when a change or termination is explicitly expressed; null otherwise
- Never hallucinate or infer dates from unrelated events

EPISODE INDICES:
- If multiple episodes are provided (indexed 0, 1, 2, …), populate episodeIndices with the 0-based indices of the episodes that directly support each fact`;

const TIMESTAMPS_BATCH_SYSTEM_PROMPT = `You are a temporal reasoning assistant. For each fact provided, extract the validity window.

Rules:
- validAt: ISO 8601 datetime when the fact became true; null if no temporal information
- invalidAt: ISO 8601 datetime when the fact stopped being true; null if ongoing or unknown
- Respond with one entry per fact in the same order as the input`;

function formatEntities(nodes: EntityNode[]): string {
  if (nodes.length === 0) return '';
  return nodes
    .map((n) => `- name: "${n.name}", types: [${n.labels.join(', ')}]`)
    .join('\n');
}

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

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);
  const entitiesText = formatEntities(nodes);

  // Build inverted signatures map: typeName → list of "SourceLabel,TargetLabel" keys
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

  let humanContent =
    `REFERENCE TIME: ${referenceTime.toISOString()}\n\n` +
    `ENTITIES:\n${entitiesText}\n\nPREVIOUS EPISODES:\n${previousEpisodesText}\n\nCURRENT EPISODE:\nName: ${episode.name}\nSource: ${episode.source}\nContent: ${episode.content}`;

  if (edgeTypesContext.length > 0) {
    humanContent += `\n\n<FACT_TYPES>\n${JSON.stringify(edgeTypesContext, null, 2)}\n</FACT_TYPES>`;
  }

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}

export function buildExtractTimestampsBatchMessages(ctx: {
  facts: string[];
  referenceTime: Date;
}): BaseMessage[] {
  const { facts, referenceTime } = ctx;

  const factsText = facts.map((f, i) => `${i}: "${f}"`).join('\n');

  const humanContent = `REFERENCE TIME: ${referenceTime.toISOString()}\n\nFACTS:\n${factsText}`;

  return [
    new SystemMessage(TIMESTAMPS_BATCH_SYSTEM_PROMPT),
    new HumanMessage(humanContent),
  ];
}
