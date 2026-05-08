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
import { GroupId, Uuid } from '../neo4j/neo4j.schemas';

export interface RawEpisode {
  uuid?: Uuid;
  name: string;
  content: string;
  source: EpisodeType;
  sourceDescription: string;
  referenceTime: Date;
  groupId: GroupId;
  sagaUuid?: Uuid;
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
