import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { UuidSchema } from '@/common/schemas';
import { EpisodicNode } from '@/knowledge-graph/models';

import { formatPreviousEpisodes, MAX_SUMMARY_CHARS } from '../text-utils';

// Schema

export const NodeSummarySchema = z.object({
  summaries: z
    .array(
      z.object({
        id: UuidSchema.describe(
          'UUID of the entity being summarized (echoed from the input)',
        ),
        summary: z
          .string()
          .describe(
            `Updated factual summary for the entity, under ${MAX_SUMMARY_CHARS} characters`,
          ),
      }),
    )
    .describe(
      'List of entity summaries. Only include entities that need summary updates.',
    ),
});

export type NodeSummary = z.infer<typeof NodeSummarySchema>;

export const nodeSummaryJsonSchema = z.toJSONSchema(NodeSummarySchema, { io: 'input' });

// Prompt builder

const SYSTEM_PROMPT = `You are an expert knowledge graph assistant. Generate a factual summary (≤ ${MAX_SUMMARY_CHARS} characters) for each entity using the provided episode context.

Rules:
- Write 2–6 dense sentences in third person
- NEVER use meta-language verbs: "mentioned", "discussed", "stated", "noted", "said"
- Write factual statements that stand alone without referencing the conversation
- Preserve names, dates, and counts precisely
- If an existing summary is provided, merge it with new facts; newer facts win on contradiction
- Skip entities with no relevant context in the episode`;

export function buildNodeSummaryMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  nodes: Array<{
    id: string;
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
      return `- id: ${n.id}, name: "${n.name}", existing_summary: "${n.summary}", facts: ${factsText}`;
    })
    .join('\n');

  const humanContent = `PREVIOUS EPISODES:\n${previousEpisodesText}\n\nCURRENT EPISODE:\n${episode.content}\n\nENTITIES:\n${entitiesText}`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
