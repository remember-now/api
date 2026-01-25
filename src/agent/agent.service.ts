import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentService {
  // private readonly logger = new Logger(AgentService.name);

  constructor() {}

  getAgentInfo(userId: number) {
    // TODO: placeholder
    return { userId };
  }
}
