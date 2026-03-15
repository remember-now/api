import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import { EpisodicNode } from '../models/nodes';
import { episodeToContext } from '../prompts/prompts.types';

const SYSTEM_PROMPT = `You are an expert knowledge graph deduplication system.

Your task is to determine whether newly extracted entities are duplicates of existing entities in the knowledge graph.

Rules:
- Two entities are duplicates only if they refer to the same real-world entity
- Never merge merely-similar or related but distinct entities
- Every extracted entity must appear in entity_resolutions exactly once
- If an extracted entity is a duplicate, set duplicate_of to the uuid of the existing candidate it duplicates
- If an extracted entity is not a duplicate, set duplicate_of to null
- Only use candidate uuids from the provided existing candidate list`;

function formatPreviousEpisodes(episodes: EpisodicNode[]): string {
  if (episodes.length === 0) return 'None';
  return episodes
    .map((e) => {
      const ctx = episodeToContext(e);
      return `- [${ctx.name}] (${ctx.validAt}): ${ctx.content}`;
    })
    .join('\n');
}

function formatEntities(
  entities: Array<{ uuid: string; name: string }>,
): string {
  if (entities.length === 0) return 'None';
  return entities.map((e) => `- uuid: ${e.uuid}, name: "${e.name}"`).join('\n');
}

export function buildDedupeNodesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  extractedNodes: Array<{ uuid: string; name: string }>;
  candidateNodes: Array<{ uuid: string; name: string }>;
  customInstructions?: string;
}): BaseMessage[] {
  const {
    episode,
    previousEpisodes,
    extractedNodes,
    candidateNodes,
    customInstructions,
  } = ctx;

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);
  const extractedText = formatEntities(extractedNodes);
  const candidatesText = formatEntities(candidateNodes);

  let humanContent =
    `PREVIOUS EPISODES:\n${previousEpisodesText}\n\n` +
    `CURRENT EPISODE:\n${episode.content}\n\n` +
    `EXTRACTED ENTITIES:\n${extractedText}\n\n` +
    `EXISTING CANDIDATE ENTITIES:\n${candidatesText}`;

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
