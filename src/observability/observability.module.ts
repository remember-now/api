import { Global, Module } from '@nestjs/common';
import type { Logger as PinoLogger } from 'pino';

import { AppConfigModule, AppConfigService, Environment } from '@/config/app';
import { LangfuseConfigModule, LangfuseConfigService } from '@/config/langfuse';
import { OtelConfigModule, OtelConfigService } from '@/config/otel';

import { createRootPinoLogger, PINO_LOGGER } from './pino';
import { PinoLoggerService } from './pino-logger.service';
import { LangfuseLlmTracer, NoOpLlmTracer, NoOpTracer, OtelTracer } from './tracers';
import { LLM_TRACER, type LlmTracer, TRACER, type Tracer } from './types';

/**
 * Tracer shutdown is handled by the OTel SDK's own SIGTERM/SIGINT handlers
 * registered in `otel.ts`.
 *
 * Two independent tracers are provided:
 *  - `TRACER` (Tracer) - structural OTel-backed tracing, gated by
 *    `TELEMETRY_ENABLED`. NoOp when telemetry is off.
 *  - `LLM_TRACER` (LlmTracer) - Langfuse callbacks that capture full LLM
 *    prompts/completions, gated by `LANGFUSE_ENABLED`. NoOp otherwise.
 */
@Global()
@Module({
  imports: [AppConfigModule, LangfuseConfigModule, OtelConfigModule],
  providers: [
    {
      provide: PINO_LOGGER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): PinoLogger =>
        createRootPinoLogger({
          level: config.logLevel,
          prettifyOutput: config.env !== Environment.Production,
        }),
    },
    PinoLoggerService,
    {
      provide: TRACER,
      inject: [OtelConfigService],
      useFactory: (otelConfig: OtelConfigService): Tracer =>
        otelConfig.telemetryEnabled ? new OtelTracer() : new NoOpTracer(),
    },
    {
      provide: LLM_TRACER,
      inject: [LangfuseConfigService],
      useFactory: (config: LangfuseConfigService): LlmTracer =>
        config.enabled ? new LangfuseLlmTracer(config) : new NoOpLlmTracer(),
    },
  ],
  exports: [PINO_LOGGER, PinoLoggerService, TRACER, LLM_TRACER],
})
export class ObservabilityModule {}
