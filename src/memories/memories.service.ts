import { Injectable } from '@nestjs/common';

import { Uuid } from '@/common/schemas';

import { CreateMemoryBlockDto, UpdateMemoryBlockDto } from './dto';

@Injectable()
export class MemoriesService {
  // private readonly logger = new Logger(MemoriesService.name);

  constructor() {}

  listMemoryBlocks(userId: Uuid) {
    // TODO: Implement
    return userId;
  }

  getMemoryBlock(userId: Uuid, blockLabel: string) {
    // TODO: Implement
    return { userId, blockLabel };
  }

  createMemoryBlock(userId: Uuid, dto: CreateMemoryBlockDto) {
    // TODO: Implement
    return { userId, dto };
  }

  updateMemoryBlock(userId: Uuid, blockLabel: string, dto: UpdateMemoryBlockDto) {
    // TODO: Implement
    return { userId, blockLabel, dto };
  }

  deleteMemoryBlock(userId: Uuid, blockLabel: string) {
    // TODO: Implement
    return { userId, blockLabel };
  }
}
