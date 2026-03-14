import { EpisodicNode } from '../models/nodes';

export interface EpisodeContext {
  name: string;
  content: string;
  sourceDescription: string;
  validAt: string;
}

export function episodeToContext(e: EpisodicNode): EpisodeContext {
  return {
    name: e.name,
    content: e.content,
    sourceDescription: e.sourceDescription,
    validAt: e.validAt.toISOString(),
  };
}
