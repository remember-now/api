import {
  EdgeTypeMap,
  EdgeTypesMap,
  EntityTypeMap,
} from '../episode/episode.types';
import { EntityEdge } from '../models/edges/entity-edge';
import { EpisodicEdge } from '../models/edges/episodic-edge';
import { EntityNode } from '../models/nodes/entity-node';
import { EpisodicNode } from '../models/nodes/episodic-node';
import { EpisodeType } from '../models/nodes/node.types';

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
}

export interface AddBulkEpisodeResult {
  episodes: EpisodicNode[];
  nodes: EntityNode[];
  edges: EntityEdge[];
  invalidatedEdges: EntityEdge[];
  episodicEdges: EpisodicEdge[];
}
