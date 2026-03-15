import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import { EntityTypeMap } from '../episode/episode.types';
import { EpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { episodeToContext } from './prompts.types';

const MESSAGE_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Your task is to extract and classify the speaker and other significant entities from conversational messages.

Extract only clearly mentioned named entities such as people, organizations, places, concepts, and events.

Rules:
- Prefer specific names over generic terms
- Do not extract relationships or adjectives
- Only extract entities that are clearly mentioned in the content
- Do not infer or hallucinate entities not present in the text
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId`;

const TEXT_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Your task is to extract named entities from a text document — people, organizations, places, concepts, events.

Extract only clearly mentioned named entities.

Rules:
- Prefer specific names over generic terms
- Do not extract relationships or adjectives
- Only extract entities that are clearly mentioned in the content
- Do not infer or hallucinate entities not present in the text
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId`;

const JSON_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Your task is to extract named entities from structured JSON data — use key names and values as context.

Extract only clearly mentioned named entities such as people, organizations, places, concepts, and events.

Rules:
- Prefer specific names over generic terms
- Do not extract relationships or adjectives
- Only extract entities that are clearly mentioned in the content
- Do not infer or hallucinate entities not present in the text
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId`;

function buildSystemPrompt(source: EpisodeType): string {
  switch (source) {
    case EpisodeType.message:
      return MESSAGE_SYSTEM_PROMPT;
    case EpisodeType.json:
      return JSON_SYSTEM_PROMPT;
    default:
      return TEXT_SYSTEM_PROMPT;
  }
}

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

export function buildExtractNodesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  entityTypes?: EntityTypeMap;
  customInstructions?: string;
}): BaseMessage[] {
  const { episode, previousEpisodes, entityTypes, customInstructions } = ctx;

  const systemPrompt = buildSystemPrompt(episode.source);

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);

  let humanContent = `PREVIOUS EPISODES:\n${previousEpisodesText}\n\nCURRENT EPISODE:\nName: ${episode.name}\nSource: ${episode.source}\nContent: ${episode.content}`;

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  if (entityTypes && Object.keys(entityTypes).length > 0) {
    const entityTypesText = Object.entries(entityTypes)
      .map(
        ([label, { description }], index) =>
          `{id: ${index}, label: "${label}", description: "${description}"}`,
      )
      .join('\n');
    humanContent += `\n\nENTITY TYPES:\n${entityTypesText}`;
  }

  return [new SystemMessage(systemPrompt), new HumanMessage(humanContent)];
}
