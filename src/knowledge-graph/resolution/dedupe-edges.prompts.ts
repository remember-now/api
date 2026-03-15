import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import { EpisodicNode } from '../models/nodes';
import { episodeToContext } from '../prompts/prompts.types';

const SYSTEM_PROMPT = `You are an expert knowledge graph edge deduplication system.

Your task is to determine whether a newly extracted fact (edge) duplicates or contradicts existing facts.

Rules:
- A duplicate fact expresses the same relationship with no new information
- A contradiction occurs when the new fact directly negates or supersedes an existing fact (e.g. a person changed jobs — the old job fact is contradicted)
- Temporal change is not deletion; use contradiction only when the new fact makes an old fact false
- Only return uuids from the provided existing fact lists
- A new fact can be both non-duplicate and non-contradicting — in that case return empty arrays`;

function formatPreviousEpisodes(episodes: EpisodicNode[]): string {
  if (episodes.length === 0) return 'None';
  return episodes
    .map((e) => {
      const ctx = episodeToContext(e);
      return `- [${ctx.name}] (${ctx.validAt}): ${ctx.content}`;
    })
    .join('\n');
}

function formatEdges(
  edges: Array<{ uuid: string; name: string; fact: string }>,
): string {
  if (edges.length === 0) return 'None';
  return edges
    .map((e) => `- uuid: ${e.uuid}, name: ${e.name}, fact: "${e.fact}"`)
    .join('\n');
}

export function buildDedupeEdgesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  newEdge: { uuid: string; name: string; fact: string };
  existingEndpointEdges: Array<{ uuid: string; name: string; fact: string }>;
  similarEdges: Array<{ uuid: string; name: string; fact: string }>;
  referenceTime: Date;
  customInstructions?: string;
}): BaseMessage[] {
  const {
    episode,
    previousEpisodes,
    newEdge,
    existingEndpointEdges,
    similarEdges,
    referenceTime,
    customInstructions,
  } = ctx;

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);
  const endpointEdgesText = formatEdges(existingEndpointEdges);
  const similarEdgesText = formatEdges(similarEdges);

  let humanContent =
    `REFERENCE TIME: ${referenceTime.toISOString()}\n\n` +
    `PREVIOUS EPISODES:\n${previousEpisodesText}\n\n` +
    `CURRENT EPISODE:\n${episode.content}\n\n` +
    `NEW FACT:\n- uuid: ${newEdge.uuid}, name: ${newEdge.name}, fact: "${newEdge.fact}"\n\n` +
    `EXISTING FACTS (same source→target):\n${endpointEdgesText}\n\n` +
    `RELATED FACTS (similar topic):\n${similarEdgesText}`;

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
