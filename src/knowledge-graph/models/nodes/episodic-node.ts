import { z } from 'zod';

import {
  createNodeDefaults,
  EpisodeType,
  NodeBase,
  NodeBaseSchema,
} from './node.types';

export interface EpisodicNode extends NodeBase {
  source: EpisodeType;
  sourceDescription: string;
  content: string;
  validAt: Date;
}

export const EpisodicNodeSchema = NodeBaseSchema.extend({
  source: z.nativeEnum(EpisodeType),
  sourceDescription: z.string(),
  content: z.string(),
  validAt: z.date(),
});

export function createEpisodicNode(
  partial: Partial<EpisodicNode> & {
    name: string;
    content: string;
    validAt: Date;
  },
): EpisodicNode {
  return {
    ...createNodeDefaults(),
    source: EpisodeType.text,
    sourceDescription: '',
    ...partial,
  };
}
