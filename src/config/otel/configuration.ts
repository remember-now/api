import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  TELEMETRY_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === 'TRUE'),
  OTEL_CONSOLE_EXPORT_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === 'TRUE'),
});

/**
 * Parses and validates OTel env vars via the canonical Zod schema.
 *
 * Used both by the NestJS `ConfigModule.forFeature` factory below AND by
 * `observability/otel.ts`, which must run before NestJS boots and therefore
 * cannot rely on `ConfigService`.
 */
export function parseOtelConfig() {
  const env = envSchema.parse(process.env);
  return {
    telemetryEnabled: env.TELEMETRY_ENABLED,
    consoleExportEnabled: env.OTEL_CONSOLE_EXPORT_ENABLED,
  };
}

export default registerAs('otel', () => parseOtelConfig());
