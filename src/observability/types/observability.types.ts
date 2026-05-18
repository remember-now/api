import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { SpanOptions } from '@opentelemetry/api';

export const TRACER = Symbol('TRACER');
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

export interface SpanHandle {
  setAttribute(key: string, value: unknown): void;
  setAttributes(attrs: Record<string, unknown>): void;
  recordException(err: unknown): void;
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
 * Structural tracer backed by raw OpenTelemetry. Emits in dev and
 * prod. Use for pipeline steps, retrievers, Neo4j queries - anything where
 * timing/structure is wanted, but where LLM prompt content must never leak.
 *
 * Spans flow to whatever processors are registered at bootstrap. When the
 * `LangfuseSpanProcessor` is active (dev), Langfuse ingests these too; in prod
 * they go to the configured OTel collector.
 */
export interface Tracer {
  withSpan<T>(
    name: string,
    fn: (span: SpanHandle) => Promise<T>,
    attrs?: Record<string, unknown>,
  ): Promise<T>;

  /**
   * Like `withSpan`, but marks this span as the trace root for Langfuse by
   * setting `langfuse.trace.name`. Use at user-facing entry points
   * (e.g. `addEpisodes`, `search`) so the trace lands with a meaningful name
   * even when the OTel parent span is filtered out of Langfuse.
   */
  withTrace<T>(
    name: string,
    fn: (span: SpanHandle) => Promise<T>,
    attrs?: Record<string, unknown>,
  ): Promise<T>;

  withRetriever<T>(
    name: string,
    fn: (span: SpanHandle) => Promise<T>,
    attrs?: Record<string, unknown>,
  ): Promise<T>;
}

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
