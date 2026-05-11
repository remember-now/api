import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';

import { ChatRequestDto, GetMessagesQueryDto } from './dto';

/**
 * Handles message/chat operations for user agents
 */
@Injectable()
export class MessagesService {
  // private readonly logger = new Logger(MessagesService.name);

  constructor() {}

  getMessages(dto: GetMessagesQueryDto, userId: Uuid) {
    // TODO: Implement
    return { dto, userId };
  }

  sendMessage(dto: ChatRequestDto, userId: Uuid) {
    // TODO: Implement
    return { dto, userId };
  }

  sendMessageStream(dto: ChatRequestDto, userId: Uuid) {
    // TODO: Implement
    return { dto, userId };
  }
}
