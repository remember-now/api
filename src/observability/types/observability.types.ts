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
 * Vendor-neutral classification for a span's observation type. The `@Span`
 * decorator translates this to whatever attribute the configured backend
 * expects (today: Langfuse's `langfuse.observation.type`). `'span'` is the
 * default and emits no attribute.
 */
export type ObservationKind = 'retriever' | 'embedding' | 'generation' | 'tool' | 'span';

/**
 * Options accepted by the `@Span` / `@Traceable` decorators. Extends OTel's
 * `SpanOptions` with:
 *  - `onResult`: post-success callback to enrich the span with attributes
 *    derived from the return value.
 *  - `asLangfuseTrace`: write `langfuse.trace.name` so Langfuse promotes the
 *    span to the trace root. Use only on entry-point methods.
 *  - `observationKind`: vendor-neutral observation classification. Distinct
 *    from OTel's `kind` (SpanKind: INTERNAL/SERVER/PRODUCER/...), which
 *    describes messaging semantics.
 *  - `captureIo`: auto-serialize method args/return as observation input/output
 *    on the span. Defaults to false; pass `true` to opt in. Synchronous
 *    serialization of `args` runs before the wrapped method, so opt in only on
 *    methods whose args are safe to walk via `JSON.stringify` - controller
 *    methods that receive request-scoped objects (Passport users, NestJS
 *    Request) have been observed to break OTel context propagation when their
 *    args are serialized.
 */
export interface ExtendedSpanOptions extends SpanOptions {
  onResult?: (result: unknown) => { attributes?: SpanOptions['attributes'] } | undefined;
  asLangfuseTrace?: boolean;
  observationKind?: ObservationKind;
  captureIo?: boolean;
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
