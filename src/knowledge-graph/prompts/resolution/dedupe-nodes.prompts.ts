import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { EpisodicNode } from '@/knowledge-graph/models';

import { formatPreviousEpisodes } from '../text-utils';

const SYSTEM_PROMPT = `You are an expert knowledge graph deduplication system.

Your task is to determine whether newly extracted entities are duplicates of existing entities in the knowledge graph.

Rules:
- Two entities are duplicates only if they refer to the same real-world entity
- Never merge merely-similar or related but distinct entities
- Every extracted entity must appear in entity_resolutions exactly once
- For each entity, return: its integer id, the best canonical name, and duplicate_candidate_id — the integer candidate_id of the matching EXISTING CANDIDATE ENTITY, or -1 when it is not a duplicate
- duplicate_candidate_id must reference a candidate_id from the EXISTING CANDIDATE ENTITIES list — never invent ids`;

function formatExtractedEntities(entities: Array<{ id: number; name: string }>): string {
  if (entities.length === 0) return 'None';
  return entities.map((e) => `- id: ${e.id}, name: "${e.name}"`).join('\n');
}

function formatCandidateEntities(
  entities: Array<{ candidateId: number; name: string }>,
): string {
  if (entities.length === 0) return 'None';
  return entities
    .map((e) => `- candidate_id: ${e.candidateId}, name: "${e.name}"`)
    .join('\n');
}

export function buildDedupeNodesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  extractedNodes: Array<{ id: number; name: string }>;
  candidateNodes: Array<{ candidateId: number; name: string }>;
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
  const extractedText = formatExtractedEntities(extractedNodes);
  const candidatesText = formatCandidateEntities(candidateNodes);

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
