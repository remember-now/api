import { pino, type Logger as PinoLogger } from 'pino';

import type { LogLevel } from '@/config/app';

export const PINO_LOGGER = Symbol('PINO_LOGGER');

/**
 * Builds the single root Pino logger used by the whole app.
 *
 * `@opentelemetry/instrumentation-pino` (loaded by `getNodeAutoInstrumentations`
 * in `otel.ts`) patches `pino` at import time. As long as `startOtel()` has
 * already run, every log record produced by this logger picks up `trace_id`,
 * `span_id`, and `trace_flags` automatically when called inside an active span.
 */
export function createRootPinoLogger({
  level,
  prettifyOutput,
}: {
  level: LogLevel;
  prettifyOutput: boolean;
}): PinoLogger {
  return pino({
    level,
    ...(prettifyOutput
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              singleLine: false,
            },
          },
        }
      : {}),
  });
}
