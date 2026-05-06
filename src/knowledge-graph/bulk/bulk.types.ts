import {
  EdgeTypeMap,
  EdgeTypesMap,
  EntityTypeMap,
} from '../episode/episode.types';
import {
  EntityEdge,
  EntityNode,
  EpisodeType,
  EpisodicEdge,
  EpisodicNode,
} from '../models';

export interface RawEpisode {
  uuid?: string;
  name: string;
  content: string;
  source: EpisodeType;
  sourceDescription: string;
  referenceTime: Date;
  groupId: string;
  sagaUuid?: string;
}

export interface AddBulkEpisodeOptions {
  userId: number;
  episodes: RawEpisode[];
  entityTypes?: EntityTypeMap;
  edgeTypes?: EdgeTypesMap;
  edgeTypeMap?: EdgeTypeMap;
  excludedEntityTypes?: string[];
  customInstructions?: string;
  updateCommunities?: boolean;
  useCombinedExtraction?: boolean;
}

export interface AddBulkEpisodeResult {
  episodes: EpisodicNode[];
  nodes: EntityNode[];
  edges: EntityEdge[];
  invalidatedEdges: EntityEdge[];
  episodicEdges: EpisodicEdge[];
}
