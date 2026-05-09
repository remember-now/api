import z from 'zod';

import {
  BaseEpisodeOptionsSchema,
  BaseEpisodeResultSchema,
  EpisodeSchema,
} from '../episode/episode.types';
import { EpisodicNodeSchema } from '../models';

// Schemas

export const AddBulkEpisodeOptionsSchema = BaseEpisodeOptionsSchema.extend({
  episodes: z.array(EpisodeSchema).min(1),
  useCombinedExtraction: z.boolean().optional(),
});

export const AddBulkEpisodeResultSchema = BaseEpisodeResultSchema.extend({
  episodes: z.array(EpisodicNodeSchema),
});

// Types

export type AddBulkEpisodeOptions = z.infer<typeof AddBulkEpisodeOptionsSchema>;
export type AddBulkEpisodeResult = z.infer<typeof AddBulkEpisodeResultSchema>;
