import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
});

export default registerAs('redis', () => {
  const env = envSchema.parse(process.env);
  return {
    url: env.REDIS_URL,
  };
});
