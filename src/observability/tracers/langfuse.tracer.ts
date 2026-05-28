import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { CallbackHandler } from '@langfuse/langchain';
import { Injectable } from '@nestjs/common';

import type { LangfuseConfigService } from '@/config/langfuse';

import type { LlmContext, LlmTracer } from '../types';

/**
 * Dev-only LLM observability. Returns a Langfuse `CallbackHandler` for each
 * LangChain `.invoke(...)` call that captures prompts, completions, model,
 * and token usage as a Langfuse generation observation - automatically
 * attached as a child of whatever OTel span is currently active.
 *
 * Configuration is consumed at construction time only to validate that
 * Langfuse is set up; the SDK reads credentials directly from env at the
 * `LangfuseSpanProcessor` registered in `otel.ts`.
 */
@Injectable()
export class LangfuseLlmTracer implements LlmTracer {
  constructor(config: LangfuseConfigService) {
    if (!config.enabled) {
      throw new Error(
        'LangfuseLlmTracer constructed with LANGFUSE_ENABLED=false. ' +
          'Use NoOpLlmTracer when Langfuse is disabled.',
      );
    }
  }

  getCallbacks(ctx?: LlmContext): BaseCallbackHandler[] {
    if (!ctx) return [];
    return [
      // Cast: @langfuse/langchain and @langchain/core ship `BaseMessage` with
      // a unique symbol that some TS resolutions don't unify, even with a
      // single deduped install. Runtime is identical.
      new CallbackHandler({
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        tags: ctx.tags,
        traceMetadata: ctx.metadata,
      }) as unknown as BaseCallbackHandler,
    ];
  }
}
