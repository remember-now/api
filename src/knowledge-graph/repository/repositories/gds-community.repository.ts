import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { Span } from '@/observability';

@Injectable()
export class GdsCommunityRepository {
  @Span()
  projectGraph(_graphName: string, _graphId: Uuid): Promise<void> {
    return Promise.resolve();
  }

  @Span()
  runLeiden(_graphName: string): Promise<{ uuid: Uuid; communityId: number }[]> {
    return Promise.resolve([]);
  }

  @Span()
  dropGraph(_graphName: string): Promise<void> {
    return Promise.resolve();
  }
}
