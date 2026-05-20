import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { SpanOptions } from '@opentelemetry/api';

export const LLM_TRACER = Symbol('LLM_TRACER');

/**
 * Carries user/session/tag metadata needed to enrich Langfuse traces when the
 * dev-only `LlmTracer` is active. In prod (`NoOpLlmTracer`) it is unused.
 */
export interface LlmContext {
  userId: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

/**
 * Options accepted by the `@Span` / `@Traceable` decorators. Extends OTel's
 * `SpanOptions` with two opt-ins:
 *  - `onResult`: post-success callback to enrich the span with attributes
 *    derived from the return value.
 *  - `asLangfuseTrace`: write `langfuse.trace.name` so Langfuse promotes the
 *    span to the trace root. Use only on entry-point methods.
 */
export interface ExtendedSpanOptions extends SpanOptions {
  onResult?: (result: unknown) => { attributes?: SpanOptions['attributes'] } | undefined;
  asLangfuseTrace?: boolean;
}

/**
 * Shape of the `metrics` object that wrapped service methods return alongside
 * their real payload so the `@Span` decorator can lift the metrics onto span
 * attributes via `metricsOnResult`.
 */
export type SpanMetrics = Record<string, string | number | boolean | undefined>;

/**
 * `onResult` callback for `@Span` that lifts a `{ metrics }` field from the
 * decorated method's return value onto the span as attributes.
 */
export const metricsOnResult = (r: unknown) => ({
  attributes: (r as { metrics: SpanMetrics }).metrics,
});

/**
 * Content-bearing observability for LLM calls. Returns LangChain callbacks
 * that capture full prompts/completions into Langfuse generation observations.
 *
 * Dev-only - in prod the `NoOpLlmTracer` returns no callbacks, so prompts and
 * responses never leave the process. The LANGFUSE_ENABLED env var is the
 * single source of truth.
 */
export interface LlmTracer {
  /**
   * When `ctx` is omitted, no callbacks are returned - matches NoOp semantics
   * and lets unit tests skip plumbing a context. When supplied, `ctx.userId`
   * is required so Langfuse traces are always attributable to a user.
   */
  getCallbacks(ctx?: LlmContext): BaseCallbackHandler[];
}
