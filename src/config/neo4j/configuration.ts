import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  NEO4J_URI: z.string().min(1, 'NEO4J_URI is required'),
  NEO4J_USERNAME: z.string().min(1, 'NEO4J_USERNAME is required'),
  NEO4J_PASSWORD: z.string().min(1, 'NEO4J_PASSWORD is required'),
  NEO4J_DATABASE: z.string().default('neo4j'),
});

export default registerAs('neo4j', () => {
  const env = envSchema.parse(process.env);
  return {
    uri: env.NEO4J_URI,
    username: env.NEO4J_USERNAME,
    password: env.NEO4J_PASSWORD,
    database: env.NEO4J_DATABASE,
  };
});
