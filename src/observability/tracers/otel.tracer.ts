import { Injectable } from '@nestjs/common';
import {
  type AttributeValue,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

import type { SpanHandle, Tracer } from '../types';

const TRACER_NAME = 'remember-now';

/**
 * Coerce arbitrary attribute values into the scalar shapes OTel accepts on a
 * span attribute (string | number | boolean). Arrays and objects are JSON
 * stringified - we don't currently pass homogeneous array attributes, and
 * stringifying keeps the values inspectable in the trace without splitting
 * across OTel's typed-array branches.
 */
function coerce(value: unknown): AttributeValue {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function applyAttributes(span: Span, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    span.setAttribute(k, coerce(v));
  }
}

function buildSpanHandle(span: Span): SpanHandle {
  return {
    setAttribute(key, value) {
      if (value === undefined || value === null) return;
      span.setAttribute(key, coerce(value));
    },
    setAttributes(attrs) {
      applyAttributes(span, attrs);
    },
    recordException(err) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    },
  };
}

@Injectable()
export class OtelTracer implements Tracer {
  private readonly otel = trace.getTracer(TRACER_NAME);

  async withSpan<T>(
    name: string,
    fn: (span: SpanHandle) => Promise<T>,
    attrs?: Record<string, unknown>,
  ): Promise<T> {
    return this.otel.startActiveSpan(name, { kind: SpanKind.INTERNAL }, async (span) => {
      if (attrs) applyAttributes(span, attrs);
      const handle = buildSpanHandle(span);
      try {
        return await fn(handle);
      } catch (err) {
        handle.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  withTrace<T>(
    name: string,
    fn: (span: SpanHandle) => Promise<T>,
    attrs?: Record<string, unknown>,
  ): Promise<T> {
    return this.withSpan(name, fn, {
      ...attrs,
      'langfuse.trace.name': name,
    });
  }

  withRetriever<T>(
    name: string,
    fn: (span: SpanHandle) => Promise<T>,
    attrs?: Record<string, unknown>,
  ): Promise<T> {
    return this.withSpan(name, fn, {
      ...attrs,
      'langfuse.observation.type': 'retriever',
    });
  }
}
