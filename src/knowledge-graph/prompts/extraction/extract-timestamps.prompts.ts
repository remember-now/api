import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

// Schemas

export const TimestampsBatchSchema = z.object({
  facts: z
    .array(
      z.object({
        validAt: z
          .string()
          .nullable()
          .optional()
          .describe(
            'When the fact became true. ISO 8601 with Z suffix (e.g., 2025-04-30T00:00:00Z). Null if no temporal information.',
          ),
        invalidAt: z
          .string()
          .nullable()
          .optional()
          .describe(
            'When the fact stopped being true. ISO 8601 with Z suffix (e.g., 2025-04-30T00:00:00Z). Null if ongoing or unknown.',
          ),
      }),
    )
    .describe('Timestamps for each fact, in the same order as the input facts'),
});

export type TimestampsBatch = z.infer<typeof TimestampsBatchSchema>;

export const timestampsBatchJsonSchema = z.toJSONSchema(TimestampsBatchSchema, {
  io: 'input',
});

// Prompt builder

const SYSTEM_PROMPT = `You are a temporal reasoning assistant. For each fact provided, extract the validity window.

Rules:
- validAt: ISO 8601 datetime when the fact became true; null if no temporal information
- invalidAt: ISO 8601 datetime when the fact stopped being true; null if ongoing or unknown
- Respond with one entry per fact in the same order as the input`;

export function buildExtractTimestampsBatchMessages(ctx: {
  facts: string[];
  referenceTime: Date;
}): BaseMessage[] {
  const { facts, referenceTime } = ctx;

  const factsText = facts.map((f, i) => `${i}: "${f}"`).join('\n');

  const humanContent = `REFERENCE TIME: ${referenceTime.toISOString()}\n\nFACTS:\n${factsText}`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
