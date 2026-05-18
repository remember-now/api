import { Inject, Injectable, LoggerService } from '@nestjs/common';
import type { Level, Logger as PinoLogger } from 'pino';

import { PINO_LOGGER } from './pino';

/**
 * NestJS `LoggerService` adapter over a single root Pino logger.
 *
 * Modeled on `nestjs-pino`'s `Logger` adapter;
 * kept thin because we don't need its per-request `AsyncLocalStorage` machinery
 * `@opentelemetry/instrumentation-pino` injects `trace_id` / `span_id`
 * for request-scoped correlation.
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  constructor(@Inject(PINO_LOGGER) private readonly logger: PinoLogger) {}

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.call('trace', message, ...optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.call('debug', message, ...optionalParams);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.call('info', message, ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.call('warn', message, ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.call('error', message, ...optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.call('fatal', message, ...optionalParams);
  }

  private call(level: Level, message: unknown, ...optionalParams: unknown[]): void {
    const objArg: Record<string, unknown> = {};

    // Nest's `Logger` passes `context` as the last optional param. Pop it into
    // a structured `context` field and pass the rest through as format args.
    let params: unknown[] = [];
    if (optionalParams.length !== 0) {
      objArg.context = optionalParams[optionalParams.length - 1];
      params = optionalParams.slice(0, -1);
    }

    if (typeof message === 'object' && message !== null) {
      if (message instanceof Error) {
        objArg.err = message;
      } else {
        Object.assign(objArg, message);
      }
      this.logger[level](objArg, ...(params as [string?, ...unknown[]]));
    } else if (
      typeof message === 'string' &&
      this.isWrongExceptionsHandlerContract(level, params)
    ) {
      // Nest's `*ExceptionsHandler` calls `.error(message, stack)` with the
      // stack as a plain string in `params[0]`. Recover an Error so Pino's
      // serializer renders it properly.
      const err = new Error(message);
      err.stack = params[0];
      objArg.err = err;
      this.logger[level](objArg);
    } else {
      this.logger[level](objArg, String(message), ...params);
    }
  }

  /**
   * Detects Nest's broken `error(message, stack)` calling convention used by
   * `ExceptionsHandler` and friends. See nestjs-pino for the original
   * derivation and the upstream Nest source links.
   */
  private isWrongExceptionsHandlerContract(
    level: Level,
    params: unknown[],
  ): params is [string] {
    return (
      level === 'error' &&
      params.length === 1 &&
      typeof params[0] === 'string' &&
      /\n\s*at /.test(params[0])
    );
  }
}
