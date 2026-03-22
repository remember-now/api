import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  EMBEDDING_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === 'TRUE'),
  GOOGLE_EMBEDDING_API_KEY: z.string().optional(),
  GOOGLE_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  GOOGLE_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
});

export default registerAs('embedding', () => {
  const env = envSchema.parse(process.env);
  return {
    embeddingEnabled: env.EMBEDDING_ENABLED,
    googleApiKey: env.GOOGLE_EMBEDDING_API_KEY,
    googleModel: env.GOOGLE_EMBEDDING_MODEL,
    dimensions: env.GOOGLE_EMBEDDING_DIMENSIONS,
  };
});
