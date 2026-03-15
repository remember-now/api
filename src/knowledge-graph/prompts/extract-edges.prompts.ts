import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import { EntityNode } from '../models/nodes';
import { EpisodicNode } from '../models/nodes';
import { episodeToContext } from './prompts.types';

const SYSTEM_PROMPT = `You are an expert at extracting relationships between entities from text.

Your task is to identify meaningful relationships between the provided entities and express them as edges in a knowledge graph.

Rules:
- Only use entity names from the provided entities list
- Extract one fact per edge
- Use active-voice relationship names in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, MARRIED_TO, FOUNDED_BY)
- The fact should be a complete sentence describing the relationship
- Only extract relationships that are clearly supported by the episode content
- Do not infer or hallucinate relationships not present in the text

DATETIME RULES:
- validAt: the ISO 8601 datetime when the fact became true; set to the reference time if the fact appears ongoing; leave null if no temporal information is present
- invalidAt: the ISO 8601 datetime when the fact stopped being true; set only when a change or termination is explicitly expressed; leave null otherwise`;

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

export function buildExtractEdgesMessages(ctx: {
  episode: EpisodicNode;
  nodes: EntityNode[];
  previousEpisodes: EpisodicNode[];
  referenceTime: Date;
  customInstructions?: string;
}): BaseMessage[] {
  const {
    episode,
    nodes,
    previousEpisodes,
    referenceTime,
    customInstructions,
  } = ctx;

  const entityNames = nodes.map((n) => n.name).join(', ');
  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);

  let humanContent =
    `REFERENCE TIME: ${referenceTime.toISOString()}\n\n` +
    `ENTITIES:\n${entityNames}\n\nPREVIOUS EPISODES:\n${previousEpisodesText}\n\nCURRENT EPISODE:\nName: ${episode.name}\nSource: ${episode.source}\nContent: ${episode.content}`;

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
