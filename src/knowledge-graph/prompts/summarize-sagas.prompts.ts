import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { z } from 'zod';

import { EpisodicNode } from '../models';
import { MAX_SUMMARY_CHARS, truncateAtSentence } from '../utils/text-utils';

// Schema

export const SagaSummarySchema = z.object({
  summary: z.string(),
});

export type SagaSummary = z.infer<typeof SagaSummarySchema>;

export const sagaSummaryJsonSchema = z.toJSONSchema(SagaSummarySchema);

// Prompt builder

const SYSTEM_PROMPT = `You are an expert knowledge distillation assistant. Given a series of episode contents and an existing saga summary, produce an updated summary that captures all durable knowledge.

OUTPUT RULES:
- Write 2–6 dense sentences in third person
- Extract durable knowledge: facts, decisions, preferences, plans, entities, relationships
- NEVER use meta-language verbs: "mentioned", "discussed", "stated", "noted", "said", "talked about"
- Write factual statements that stand alone without referencing the conversation
- Preserve names, dates, and counts precisely
- Merge new facts with the existing summary; newer facts win on contradiction
- The result must read as a factual brief, not a conversation summary

GOOD example:
"Alice works as a senior engineer at Acme Corp. She is learning Spanish and attends classes on Tuesday evenings. Her dog Max is a 3-year-old golden retriever."

BAD example:
"Alice mentioned that she works at Acme Corp. She talked about learning Spanish and noted that her dog's name is Max."`;

export function buildSummarizeSagaMessages(ctx: {
  existingSummary: string;
  newEpisodes: EpisodicNode[];
}): BaseMessage[] {
  const { existingSummary, newEpisodes } = ctx;

  const episodesText = newEpisodes
    .map(
      (ep, i) => `[Episode ${i}] (${ep.validAt.toISOString()})\n${ep.content}`,
    )
    .join('\n\n');

  const existingText = existingSummary.trim()
    ? truncateAtSentence(existingSummary, MAX_SUMMARY_CHARS)
    : 'None';

  const humanContent = `EXISTING SUMMARY:\n${existingText}\n\nNEW EPISODES:\n${episodesText}`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
