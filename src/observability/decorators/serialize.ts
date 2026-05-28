/**
 * Best-effort JSON serialization for span attributes. OTel's `setAttribute`
 * rejects non-primitive values and `@langfuse/otel`'s `LangfuseSpanProcessor`
 * doesn't serialize for you (only `@langfuse/tracing`'s SDK helpers do, and
 * we go straight through OTel) - so we serialize before setting the attribute.
 */
const MAX_ARRAY_LENGTH = 64;

export function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, val: unknown) => {
      if (Array.isArray(val) && val.length >= MAX_ARRAY_LENGTH) {
        return `<oversized_array:${val.length}>`;
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '<cycle>';
        seen.add(val);
      }
      return val;
    });
  } catch {
    return '<failed to serialize>';
  }
}
