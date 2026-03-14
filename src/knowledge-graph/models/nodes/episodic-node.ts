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
  entityEdges: string[];
}

export const EpisodicNodeSchema = NodeBaseSchema.extend({
  source: z.nativeEnum(EpisodeType),
  sourceDescription: z.string(),
  content: z.string(),
  validAt: z.date(),
  entityEdges: z.array(z.string()),
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
    entityEdges: [],
    ...partial,
  };
}
