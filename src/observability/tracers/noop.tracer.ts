import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Injectable } from '@nestjs/common';

import type { LlmTracer } from '../types';

/**
 * No-op `LlmTracer` used in production (Langfuse disabled) and in unit tests.
 * Returns no callbacks - LangChain `.invoke(...)` calls run without Langfuse
 * observation, so prompts and responses never leave the process.
 */
@Injectable()
export class NoOpLlmTracer implements LlmTracer {
  getCallbacks(): BaseCallbackHandler[] {
    return [];
  }
}
