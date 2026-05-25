import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { CommunityEdge } from '@/knowledge-graph/models';
import { Span } from '@/observability';

@Injectable()
export class CommunityEdgeRepository {
  @Span()
  save(_edge: CommunityEdge): Promise<string> {
    return Promise.resolve('');
  }

  @Span()
  saveBulk(_edges: CommunityEdge[]): Promise<void> {
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
  getById(_id: Uuid): Promise<CommunityEdge | null> {
    return Promise.resolve(null);
  }
}
