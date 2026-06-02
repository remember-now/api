import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { MAX_SUMMARY_CHARS } from '../text-utils';

// Schema

export const SummarySchema = z.object({
  summary: z
    .string()
    .max(MAX_SUMMARY_CHARS)
    .describe('Combined summary covering the durable facts from both inputs'),
});

export type SummaryOutput = z.infer<typeof SummarySchema>;

// Prompt builder

const SYSTEM_PROMPT = `You are a helpful assistant that combines summaries into a single dense factual summary.

Your task is to synthesize the information from two summaries into a single information-dense summary.

Rules:
- Preserve all materially relevant names, roles, places, dates, counts, and changes over time that are explicitly supported.
- Prefer compact factual sentences over vague thematic phrasing.
- When the durable fact is the content of what was said, state the content directly instead of narrating that it was said.
- Use communication verbs only when the act of speaking, asking, sharing, presenting, or announcing is itself the important fact.
- Avoid filler verbs like "mentioned", "described", "stated", "reported", "noted", "discussed", "referenced", 
and "indicated" unless the communication act itself matters.
- The combined summary MUST be under ${MAX_SUMMARY_CHARS} characters.`;

function formatSummaries(summaries: readonly string[]): string {
  return summaries.map((s, i) => `[${i}] ${s}`).join('\n');
}

export function buildSummarizePairMessages(ctx: {
  summaries: [string, string];
}): BaseMessage[] {
  const { summaries } = ctx;

  const humanContent = `Apply every rule from the system instructions when synthesizing the summaries below.

<SUMMARIES>
${formatSummaries(summaries)}
</SUMMARIES>`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
