/**
 * Tracks whether `otel.ts` registered the Langfuse span processor at boot.
 *
 * The `@Span` decorator reads this to decide whether to serialize I/O
 *
 * `otel.ts` is the single source of truth for whether Langfuse is wired up,
 * so it's also the single place that flips this flag.
 */
let enabled = false;

export function setLangfuseEnabled(value: boolean): void {
  enabled = value;
}

export function isLangfuseEnabled(): boolean {
  return enabled;
}
