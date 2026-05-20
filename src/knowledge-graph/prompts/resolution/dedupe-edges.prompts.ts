import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { EpisodicNode } from '@/knowledge-graph/models';

import { formatPreviousEpisodes } from '../text-utils';

const SYSTEM_PROMPT = `You are an expert knowledge graph edge deduplication system.

Your task is to determine whether a newly extracted fact (edge) duplicates or contradicts existing facts.

Rules:
- A duplicate fact expresses the same relationship with no new information
- A contradiction occurs when the new fact directly negates or supersedes an existing fact (e.g. a person changed jobs — the old job fact is contradicted)
- Temporal change is not deletion; use contradiction only when the new fact makes an old fact false
- Return integer indices from the unified EXISTING FACTS list (numbered continuously across all sections)
- duplicate_facts: indices of facts that say the same thing as the new fact (should only reference EXISTING FACTS or REVERSED-DIRECTION FACTS)
- contradicted_facts: indices of facts that are made false by the new fact (can reference any fact in the list)
- A fact can appear in BOTH arrays — this means it is superseded: the same information but now outdated
- Return empty arrays when no duplicates or contradictions exist
- REVERSED-DIRECTION FACTS are duplicates only when the relation is symmetric (sibling, spouse, colleague). For asymmetric relations (manages, owns, loves), reversed direction means a different statement — not a duplicate.`;

function formatEdges(edges: Array<{ idx: number; name: string; fact: string }>): string {
  if (edges.length === 0) return 'None';
  return edges
    .map((e) => `- idx: ${e.idx}, name: ${e.name}, fact: "${e.fact}"`)
    .join('\n');
}

function rangeLabel(offset: number, count: number): string {
  if (count === 0) return `index ${offset} (none)`;
  return count === 1 ? `index ${offset}` : `indices ${offset}–${offset + count - 1}`;
}

export function buildDedupeEdgesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  newEdge: { name: string; fact: string };
  sameDirectionEdges: Array<{ idx: number; name: string; fact: string }>;
  reversedDirectionEdges: Array<{ idx: number; name: string; fact: string }>;
  similarEdges: Array<{ idx: number; name: string; fact: string }>;
  referenceTime: Date;
  customInstructions?: string;
}): BaseMessage[] {
  const {
    episode,
    previousEpisodes,
    newEdge,
    sameDirectionEdges,
    reversedDirectionEdges,
    similarEdges,
    referenceTime,
    customInstructions,
  } = ctx;

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);
  const sameRange = rangeLabel(0, sameDirectionEdges.length);
  const reversedRange = rangeLabel(
    sameDirectionEdges.length,
    reversedDirectionEdges.length,
  );
  const similarRange = rangeLabel(
    sameDirectionEdges.length + reversedDirectionEdges.length,
    similarEdges.length,
  );

  let humanContent =
    `REFERENCE TIME: ${referenceTime.toISOString()}\n\n` +
    `PREVIOUS EPISODES:\n${previousEpisodesText}\n\n` +
    `CURRENT EPISODE:\n${episode.content}\n\n` +
    `NEW FACT:\n- name: ${newEdge.name}, fact: "${newEdge.fact}"\n\n` +
    `EXISTING FACTS (same source→target as new fact, ${sameRange}):\n${formatEdges(sameDirectionEdges)}\n\n` +
    `REVERSED-DIRECTION FACTS (same nodes swapped, ${reversedRange}):\n${formatEdges(reversedDirectionEdges)}\n\n` +
    `FACT INVALIDATION CANDIDATES (similar topic, ${similarRange}):\n${formatEdges(similarEdges)}`;

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
