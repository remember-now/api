import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Injectable } from '@nestjs/common';

import type { LlmTracer, SpanHandle, Tracer } from '../types';

const NOOP_HANDLE: SpanHandle = {
  setAttribute: () => undefined,
  setAttributes: () => undefined,
  recordException: () => undefined,
};

/**
 * No-op `Tracer` for unit tests. Production always uses `OtelTracer`.
 */
@Injectable()
export class NoOpTracer implements Tracer {
  withSpan<T>(_name: string, fn: (span: SpanHandle) => Promise<T>): Promise<T> {
    return fn(NOOP_HANDLE);
  }

  withTrace<T>(_name: string, fn: (span: SpanHandle) => Promise<T>): Promise<T> {
    return fn(NOOP_HANDLE);
  }

  withRetriever<T>(_name: string, fn: (span: SpanHandle) => Promise<T>): Promise<T> {
    return fn(NOOP_HANDLE);
  }
}

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
