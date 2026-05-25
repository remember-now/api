import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { CommunityNode } from '@/knowledge-graph/models';
import { SearchBySimilarityParams, SearchByTextParams } from '@/knowledge-graph/types';
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
  delete(_id: Uuid): Promise<void> {
    return Promise.resolve();
  }

  @Span()
  deleteByIds(_ids: Uuid[]): Promise<void> {
    return Promise.resolve();
  }

  @Span()
  getById(_id: Uuid): Promise<CommunityNode | null> {
    return Promise.resolve(null);
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
