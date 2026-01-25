import { Injectable } from '@nestjs/common';

import { ChatRequestDto, GetMessagesQueryDto } from './dto';

/**
 * Handles message/chat operations for user agents
 */
@Injectable()
export class MessagesService {
  // private readonly logger = new Logger(MessagesService.name);

  constructor() {}

  getMessages(dto: GetMessagesQueryDto, userId: number) {
    // TODO: Implement
    return { dto, userId };
  }

  sendMessage(dto: ChatRequestDto, userId: number) {
    // TODO: Implement
    return { dto, userId };
  }

  sendMessageStream(dto: ChatRequestDto, userId: number) {
    // TODO: Implement
    return { dto, userId };
  }
}
