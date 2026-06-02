import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  // Soft node-count limit above which a graph stops triggering full Louvain
  // rebuilds and falls back to the incremental update path. 0 disables the
  // limit (always rebuild).
  COMMUNITY_REBUILD_MAX_NODES: z.coerce.number().int().nonnegative().default(0),
  // Sliding debounce window (ms) for coalescing per-graph rebuilds after
  // episode ingestion.
  COMMUNITY_REBUILD_DEBOUNCE_MS: z.coerce.number().int().positive().default(30000),
});

export default registerAs('community', () => {
  const env = envSchema.parse(process.env);
  return {
    rebuildMaxNodes: env.COMMUNITY_REBUILD_MAX_NODES,
    rebuildDebounceMs: env.COMMUNITY_REBUILD_DEBOUNCE_MS,
  };
});
