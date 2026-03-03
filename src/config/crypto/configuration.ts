import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be valid hex'),
});

export default registerAs('crypto', () => {
  const env = envSchema.parse(process.env);
  return {
    encryptionKey: Buffer.from(env.ENCRYPTION_KEY, 'hex'),
  };
});
