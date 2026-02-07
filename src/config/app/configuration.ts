import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const envSchema = z.object({
  NODE_ENV: z
    .string()
    .default('development')
    .transform((val) => {
      const aliases: Record<string, string> = {
        dev: 'development',
        prod: 'production',
      };
      return aliases[val] ?? val;
    })
    .pipe(z.enum(['development', 'production', 'test'])),
  APP_PORT: z.coerce.number().default(3333),
  APP_FRONTEND_URL: z.url().default('http://localhost:5173'),
  APP_SESSION_SECRET: z.string().min(1, 'APP_SESSION_SECRET is required'),
  APP_SESSION_EXPIRY_HOURS: z.coerce.number().default(336),
  GEMINI_API_KEY: z.string().optional(),
});

export default registerAs('app', () => {
  const env = envSchema.parse(process.env);
  return {
    env: env.NODE_ENV,
    port: env.APP_PORT,
    frontendUrl: env.APP_FRONTEND_URL,
    sessionSecret: env.APP_SESSION_SECRET,
    sessionExpiryHours: env.APP_SESSION_EXPIRY_HOURS,
    geminiApiKey: env.GEMINI_API_KEY,
  };
});
