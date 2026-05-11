import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { EpisodicNode } from '@/knowledge-graph/models';

import { formatPreviousEpisodes } from '../text-utils';

const SYSTEM_PROMPT = `You are an expert knowledge graph edge deduplication system.

Your task is to determine whether a newly extracted fact (edge) duplicates or contradicts existing facts.

Rules:
- A duplicate fact expresses the same relationship with no new information
- A contradiction occurs when the new fact directly negates or supersedes an existing fact (e.g. a person changed jobs — the old job fact is contradicted)
- Temporal change is not deletion; use contradiction only when the new fact makes an old fact false
- Return integer indices from the unified EXISTING FACTS list (which includes both same-endpoint facts and similar-topic candidates, numbered continuously)
- duplicate_facts: indices of facts that say the same thing as the new fact (should only reference same-endpoint facts)
- contradicted_facts: indices of facts that are made false by the new fact (can reference any fact in the list)
- A fact can appear in BOTH arrays — this means it is superseded: the same information but now outdated
- Return empty arrays when no duplicates or contradictions exist`;

function formatEdges(edges: Array<{ idx: number; name: string; fact: string }>): string {
  if (edges.length === 0) return 'None';
  return edges
    .map((e) => `- idx: ${e.idx}, name: ${e.name}, fact: "${e.fact}"`)
    .join('\n');
}

export function buildDedupeEdgesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  newEdge: { name: string; fact: string };
  existingEndpointEdges: Array<{ idx: number; name: string; fact: string }>;
  similarEdges: Array<{ idx: number; name: string; fact: string }>;
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

  // Indices are continuous: endpoint edges come first (0..N-1), then similar edges (N..M)
  let humanContent =
    `REFERENCE TIME: ${referenceTime.toISOString()}\n\n` +
    `PREVIOUS EPISODES:\n${previousEpisodesText}\n\n` +
    `CURRENT EPISODE:\n${episode.content}\n\n` +
    `NEW FACT:\n- name: ${newEdge.name}, fact: "${newEdge.fact}"\n\n` +
    `EXISTING FACTS (same source→target, indices 0–${Math.max(0, existingEndpointEdges.length - 1)}):\n${endpointEdgesText}\n\n` +
    `FACT INVALIDATION CANDIDATES (similar topic, indices ${existingEndpointEdges.length}–${existingEndpointEdges.length + Math.max(0, similarEdges.length - 1)}):\n${similarEdgesText}`;

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
