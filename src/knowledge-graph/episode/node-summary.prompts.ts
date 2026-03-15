import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import { EpisodicNode } from '../models/nodes';

const SYSTEM_PROMPT = `You are an expert knowledge graph assistant. Generate a concise factual summary (≤ 200 characters) for each entity using the provided episode context. Only summarize entities with relevant information. Skip entities with no context.`;

function formatPreviousEpisodes(episodes: EpisodicNode[]): string {
  if (episodes.length === 0) {
    return 'None';
  }
  return episodes
    .map((e) => `- [${e.name}] (${e.validAt.toISOString()}): ${e.content}`)
    .join('\n');
}

export function buildNodeSummaryMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  nodes: Array<{
    uuid: string;
    name: string;
    summary: string;
    facts: string[];
  }>;
}): BaseMessage[] {
  const { episode, previousEpisodes, nodes } = ctx;

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);

  const entitiesText = nodes
    .map((n) => {
      const factsText = n.facts.length > 0 ? JSON.stringify(n.facts) : '[]';
      return `- uuid: ${n.uuid}, name: "${n.name}", existing_summary: "${n.summary}", facts: ${factsText}`;
    })
    .join('\n');

  const humanContent = `PREVIOUS EPISODES:\n${previousEpisodesText}\n\nCURRENT EPISODE:\n${episode.content}\n\nENTITIES:\n${entitiesText}`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
