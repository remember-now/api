import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  PLATFORM_MODEL_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  GEMINI_API_KEY: z.string().optional(),
  LLM_PLATFORM_MODEL: z.string().default('gemini-2.5-flash'),
  LLM_PLATFORM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
});

export default registerAs('llm', () => {
  const env = envSchema.parse(process.env);
  return {
    platformModelEnabled: env.PLATFORM_MODEL_ENABLED,
    geminiApiKey: env.GEMINI_API_KEY,
    platformModel: env.LLM_PLATFORM_MODEL,
    platformMaxOutputTokens: env.LLM_PLATFORM_MAX_OUTPUT_TOKENS,
  };
});
