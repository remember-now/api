import { Global, Module } from '@nestjs/common';
import type { Logger as PinoLogger } from 'pino';

import { AppConfigModule, AppConfigService, Environment } from '@/config/app';
import { LangfuseConfigModule, LangfuseConfigService } from '@/config/langfuse';

import { createRootPinoLogger, PINO_LOGGER } from './pino';
import { PinoLoggerService } from './pino-logger.service';
import { LangfuseLlmTracer, NoOpLlmTracer } from './tracers';
import { LLM_TRACER, type LlmTracer } from './types';

/**
 * Tracer shutdown is handled by the OTel SDK's own SIGTERM/SIGINT handlers
 * registered in `otel.ts`.
 *
 * Structural OTel tracing flows through the `@Span` decorator (which calls
 * `trace.getTracer(...)` directly). The `LLM_TRACER` (LlmTracer) provider
 * supplies Langfuse callbacks that capture full LLM prompts/completions,
 * gated by `LANGFUSE_ENABLED`. NoOp otherwise.
 */
@Global()
@Module({
  imports: [AppConfigModule, LangfuseConfigModule],
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
      provide: LLM_TRACER,
      inject: [LangfuseConfigService],
      useFactory: (config: LangfuseConfigService): LlmTracer =>
        config.enabled ? new LangfuseLlmTracer(config) : new NoOpLlmTracer(),
    },
  ],
  exports: [PINO_LOGGER, PinoLoggerService, LLM_TRACER],
})
export class ObservabilityModule {}
