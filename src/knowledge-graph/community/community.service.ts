import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';
import { Span } from '@/observability';

@Injectable()
export class CommunityService {
  @Span('CommunityService.buildCommunities')
  buildCommunities(_userId: Uuid, _graphId: Uuid): Promise<void> {
    return Promise.resolve();
  }
}
