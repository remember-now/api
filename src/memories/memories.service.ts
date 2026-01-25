import { Injectable } from '@nestjs/common';

import { CreateMemoryBlockDto, UpdateMemoryBlockDto } from './dto';

@Injectable()
export class MemoriesService {
  // private readonly logger = new Logger(MemoriesService.name);

  constructor() {}

  listMemoryBlocks(userId: number) {
    // TODO: Implement
    return userId;
  }

  getMemoryBlock(userId: number, blockLabel: string) {
    // TODO: Implement
    return { userId, blockLabel };
  }

  createMemoryBlock(userId: number, dto: CreateMemoryBlockDto) {
    // TODO: Implement
    return { userId, dto };
  }

  updateMemoryBlock(
    userId: number,
    blockLabel: string,
    dto: UpdateMemoryBlockDto,
  ) {
    // TODO: Implement
    return { userId, blockLabel, dto };
  }

  deleteMemoryBlock(userId: number, blockLabel: string) {
    // TODO: Implement
    return { userId, blockLabel };
  }
}
