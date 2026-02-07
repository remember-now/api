import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL is required'),
});

export default registerAs('postgres', () => {
  const env = envSchema.parse(process.env);
  return {
    databaseUrl: env.POSTGRES_URL,
  };
});
