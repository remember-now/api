import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { EdgeTypeMap, EdgeTypeMappings } from '../episode/episode.types';
import { EntityNode, EpisodicNode } from '../models';
import { episodeToContext } from './prompts.types';

const SYSTEM_PROMPT = `You are an expert at extracting relationships between entities from text.

Your task is to identify meaningful relationships between the provided entities and express them as edges in a knowledge graph.

Rules:
- Only use entity names from the provided entities list
- Extract one fact per edge — a complete sentence describing the relationship
- Only extract relationships clearly supported by the episode content
- Do not infer or hallucinate relationships not present in the text
- Skip semantically redundant facts already captured by other edges in this batch
- Self-referencing facts (source entity = target entity) are allowed when clearly justified, but two-entity facts are preferred
- Resolve temporal expressions ("last year", "recently") against REFERENCE_TIME; use precise ISO 8601 datetimes

RELATION TYPE RULES:
- If FACT_TYPES are provided and the relationship matches one of the types (considering the entity type signature), use that fact_type_name as the relation type
- Otherwise, derive a relation type in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, MARRIED_TO, FOUNDED_BY)

DATETIME RULES:
- validAt: the ISO 8601 datetime when the fact became true; set to the reference time if the fact appears ongoing; leave null if no temporal information is present
- invalidAt: the ISO 8601 datetime when the fact stopped being true; set only when a change or termination is explicitly expressed; leave null otherwise

EPISODE INDICES:
- If multiple episodes are provided (indexed 0, 1, 2, …), populate episodeIndices with the 0-based indices of the episodes that directly support each fact`;

const TIMESTAMPS_BATCH_SYSTEM_PROMPT = `You are a temporal reasoning assistant. For each fact provided, extract the validity window.

Rules:
- validAt: ISO 8601 datetime when the fact became true; null if no temporal information
- invalidAt: ISO 8601 datetime when the fact stopped being true; null if ongoing or unknown
- Respond with one entry per fact in the same order as the input`;

function formatPreviousEpisodes(episodes: EpisodicNode[]): string {
  if (episodes.length === 0) {
    return 'None';
  }
  return episodes
    .map((e) => {
      const ctx = episodeToContext(e);
      return `- [${ctx.name}] (${ctx.validAt}): ${ctx.content}`;
    })
    .join('\n');
}

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
