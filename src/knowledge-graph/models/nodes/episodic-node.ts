import { z } from 'zod';

import { createNodeDefaults, EpisodeType, NodeBaseSchema } from './node.types';

export const EpisodicNodeSchema = NodeBaseSchema.extend({
  source: z.enum(EpisodeType),
  sourceDescription: z.string(),
  content: z.string(),
  validAt: z.date(),
  entityEdges: z.array(z.string()),
});

export type EpisodicNode = z.infer<typeof EpisodicNodeSchema>;

export function createEpisodicNode(
  partial: Partial<EpisodicNode> & {
    name: string;
    groupId: string;
    content: string;
    validAt: Date;
  },
): EpisodicNode {
  return {
    ...createNodeDefaults(),
    labels: ['Episodic'],
    source: EpisodeType.text,
    sourceDescription: '',
    entityEdges: [],
    ...partial,
  };
}
