import { z } from 'zod';

// Schemas

export const FilterClauseResultSchema = z.object({
  /** Zero or more AND-joined conditions (no leading WHERE/AND keyword). */
  clause: z.string(),
  params: z.record(z.string(), z.unknown()),
});

// Types

export type FilterClauseResult = z.infer<typeof FilterClauseResultSchema>;
