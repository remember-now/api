import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

// `message` may contain user-derived text (entity names, facts) and is only
// safe to feed back to the LLM as retry context. `code` is structural and is
// what surfaces in errors and logs.
export type Violation = {
  code: string;
  message: string;
};

export interface InvokeStructuredOptions<T = unknown> {
  runName: string;
  tags?: string[];
  callbacks?: BaseCallbackHandler[];
  maxRetries?: number;
  // Return [] to pass; non-empty results are fed back to the model on retry.
  validate?: (parsed: T) => Violation[];
}

export const DEFAULT_MAX_RETRIES = 3;
