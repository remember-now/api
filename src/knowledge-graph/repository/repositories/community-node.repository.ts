import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { CommunityNode } from '@/knowledge-graph/models';
import {
  GetByGraphIdsParams,
  SearchBySimilarityParams,
  SearchByTextParams,
} from '@/knowledge-graph/types';
import { Span } from '@/observability';

@Injectable()
export class CommunityNodeRepository {
  @Span()
  save(_node: CommunityNode): Promise<string> {
    return Promise.resolve('');
  }

  @Span()
  saveBulk(_nodes: CommunityNode[]): Promise<void> {
    return Promise.resolve();
  }

  @Span()
  delete(_uuid: Uuid): Promise<void> {
    return Promise.resolve();
  }

  @Span()
  deleteByUuids(_uuids: Uuid[]): Promise<void> {
    return Promise.resolve();
  }

  @Span()
  deleteByGraphId(_graphId: Uuid): Promise<void> {
    return Promise.resolve();
  }

  @Span()
  getByUuid(_uuid: Uuid): Promise<CommunityNode | null> {
    return Promise.resolve(null);
  }

  @Span()
  getByUuids(_uuids: Uuid[]): Promise<CommunityNode[]> {
    return Promise.resolve([]);
  }

  @Span()
  getByGraphIds(_params: GetByGraphIdsParams): Promise<CommunityNode[]> {
    return Promise.resolve([]);
  }

  @Span()
  searchByName(_params: SearchByTextParams): Promise<CommunityNode[]> {
    return Promise.resolve([]);
  }

  @Span()
  searchBySimilarity(_params: SearchBySimilarityParams): Promise<CommunityNode[]> {
    return Promise.resolve([]);
  }
}
