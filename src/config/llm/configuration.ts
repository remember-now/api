import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  PLATFORM_MODEL_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === 'TRUE'),
  GEMINI_API_KEY: z.string().optional(),
  LLM_PLATFORM_MODEL: z.string().default('gemini-2.5-flash'),
});

export default registerAs('llm', () => {
  const env = envSchema.parse(process.env);
  return {
    platformModelEnabled: env.PLATFORM_MODEL_ENABLED,
    geminiApiKey: env.GEMINI_API_KEY,
    platformModel: env.LLM_PLATFORM_MODEL,
  };
});
