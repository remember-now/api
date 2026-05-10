import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { EpisodicNode } from '../models';
import { MAX_SUMMARY_CHARS } from './text-utils';

const SYSTEM_PROMPT = `You are an expert knowledge graph assistant. Generate a factual summary (≤ ${MAX_SUMMARY_CHARS} characters) for each entity using the provided episode context.

Rules:
- Write 2–6 dense sentences in third person
- NEVER use meta-language verbs: "mentioned", "discussed", "stated", "noted", "said"
- Write factual statements that stand alone without referencing the conversation
- Preserve names, dates, and counts precisely
- If an existing summary is provided, merge it with new facts; newer facts win on contradiction
- Skip entities with no relevant context in the episode`;

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
