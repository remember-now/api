import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { DEFAULT_MAX_RETRIES, type InvokeStructuredOptions } from './types';

// TODO: We do not handle this error in any way.
export class StructuredOutputValidationError extends Error {
  constructor(
    public readonly runName: string,
    public readonly zodError: z.ZodError,
  ) {
    super(
      `Structured output validation failed for "${runName}" after retries: ${summarize(zodError)}`,
    );
    this.name = 'StructuredOutputValidationError';
  }
}

export async function invokeStructured<S extends z.ZodType>(
  model: BaseChatModel,
  schema: S,
  messages: BaseMessage[],
  opts: InvokeStructuredOptions,
): Promise<z.infer<S>> {
  const { runName, tags = [], callbacks, maxRetries = DEFAULT_MAX_RETRIES } = opts;
  const jsonSchema = z.toJSONSchema(schema, { io: 'input' });
  const runnable = model.withStructuredOutput(jsonSchema);

  let currentMessages = messages;
  let lastError: z.ZodError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const raw: unknown = await runnable.invoke(currentMessages, {
      callbacks,
      runName: attempt === 1 ? runName : `${runName}.retry-${attempt - 1}`,
      tags: attempt === 1 ? tags : [...tags, 'retry'],
    });

    const parsed = await schema.safeParseAsync(raw);
    if (parsed.success) return parsed.data;

    lastError = parsed.error;
    currentMessages = [
      ...currentMessages,
      new HumanMessage(formatFeedback(parsed.error)),
    ];
  }

  throw new StructuredOutputValidationError(runName, lastError!);
}

function formatFeedback(error: z.ZodError): string {
  const bullets = error.issues
    .map((i) => `- ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n');
  return `Your previous response did not match the required schema. Validation errors:\n${bullets}\n\nPlease retry with a response that conforms to the schema.`;
}

function summarize(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}
