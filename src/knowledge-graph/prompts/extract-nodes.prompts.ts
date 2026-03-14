import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import { EpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { episodeToContext } from './prompts.types';

function getSourceLabel(source: EpisodeType): string {
  switch (source) {
    case EpisodeType.message:
      return 'conversational message';
    case EpisodeType.json:
      return 'structured JSON data';
    case EpisodeType.text:
    default:
      return 'text document';
  }
}

function buildSystemPrompt(source: EpisodeType): string {
  const sourceLabel = getSourceLabel(source);
  return `You are an expert knowledge graph builder. Your task is to extract named entities from a ${sourceLabel}.

Extract only clearly mentioned named entities such as people, organizations, places, concepts, and events.

Rules:
- Prefer specific names over generic terms
- Do not extract relationships or adjectives
- Only extract entities that are clearly mentioned in the content
- Do not infer or hallucinate entities not present in the text
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId`;
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
  entityTypes?: Record<string, string>;
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
        ([label, description], index) =>
          `{id: ${index}, label: "${label}", description: "${description}"}`,
      )
      .join('\n');
    humanContent += `\n\nENTITY TYPES:\n${entityTypesText}`;
  }

  return [new SystemMessage(systemPrompt), new HumanMessage(humanContent)];
}
