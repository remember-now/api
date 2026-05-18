import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  LANGFUSE_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === 'TRUE'),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.url().default('http://localhost:3000'),
});

/**
 * Langfuse is dev-only in this codebase (never enabled on the hosted product).
 */
const LANGFUSE_ENVIRONMENT = 'dev';

/**
 * Parses and validates Langfuse env vars via the canonical Zod schema.
 *
 * Used both by the NestJS `ConfigModule.forFeature` factory below AND by
 * `observability/otel.ts`, which must run before NestJS boots and therefore
 * cannot rely on `ConfigService`.
 */
export function parseLangfuseConfig() {
  const env = envSchema.parse(process.env);
  return {
    enabled: env.LANGFUSE_ENABLED,
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    environment: LANGFUSE_ENVIRONMENT,
  };
}

export default registerAs('langfuse', () => parseLangfuseConfig());
