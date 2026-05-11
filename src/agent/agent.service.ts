import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';

@Injectable()
export class AgentService {
  // private readonly logger = new Logger(AgentService.name);

  constructor() {}

  getAgentInfo(userId: Uuid) {
    // TODO: placeholder
    return { userId };
  }
}
