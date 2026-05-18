import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export const LogLevelSchema = z.enum([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

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
  APP_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  APP_FRONTEND_URL: z.url().default('http://localhost:5173'),
  APP_SESSION_SECRET: z.string().min(1, 'APP_SESSION_SECRET is required'),
  APP_SESSION_EXPIRY_HOURS: z.coerce.number().positive().default(336),
  APP_LOG_LEVEL: LogLevelSchema.default('info'),
});

export default registerAs('app', () => {
  const env = envSchema.parse(process.env);
  return {
    env: env.NODE_ENV,
    port: env.APP_PORT,
    frontendUrl: env.APP_FRONTEND_URL,
    sessionSecret: env.APP_SESSION_SECRET,
    sessionExpiryHours: env.APP_SESSION_EXPIRY_HOURS,
    logLevel: env.APP_LOG_LEVEL,
  };
});
