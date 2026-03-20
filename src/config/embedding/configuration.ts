import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  EMBEDDING_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === 'TRUE'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-004'),
});

export default registerAs('embedding', () => {
  const env = envSchema.parse(process.env);
  return {
    embeddingEnabled: env.EMBEDDING_ENABLED,
    apiKey: env.EMBEDDING_API_KEY,
    model: env.EMBEDDING_MODEL,
  };
});
