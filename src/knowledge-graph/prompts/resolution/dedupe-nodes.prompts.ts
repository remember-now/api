import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { EpisodicNode } from '@/knowledge-graph/models';
import { NodeNameSchema } from '@/knowledge-graph/types';

import { formatPreviousEpisodes } from '../text-utils';

// Schemas

export const NodeResolutionSchema = z.object({
  id: z.number().describe('integer id of the entity'),
  name: NodeNameSchema.describe(
    'Name of the entity. Should be the most complete and descriptive name of the entity. Do not include any JSON formatting in the Entity name such as {}.',
  ),
  duplicate_candidate_id: z
    .number()
    .int()
    .describe(
      'candidate_id of the matching EXISTING CANDIDATE ENTITY, or -1 if no duplicate exists.',
    ),
});

export const NodeResolutionsSchema = z.object({
  entity_resolutions: z.array(NodeResolutionSchema).describe('List of resolved nodes'),
});

export type NodeResolutions = z.infer<typeof NodeResolutionsSchema>;

export const nodeResolutionsJsonSchema = z.toJSONSchema(NodeResolutionsSchema, {
  io: 'input',
});

// Prompt builder

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
