import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  EMBEDDING_API_KEY: z.string(),
  EMBEDDING_MODEL: z.string().default('text-embedding-004'),
});

export default registerAs('embedding', () => {
  const env = envSchema.parse(process.env);
  return { apiKey: env.EMBEDDING_API_KEY, model: env.EMBEDDING_MODEL };
});
