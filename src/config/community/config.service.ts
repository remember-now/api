import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CommunityConfigService {
  constructor(private readonly configService: ConfigService) {}

  get rebuildMaxNodes(): number {
    return this.configService.get<number>('community.rebuildMaxNodes')!;
  }

  get rebuildDebounceMs(): number {
    return this.configService.get<number>('community.rebuildDebounceMs')!;
  }

  /** The soft node-count limit only applies when set to a positive value. */
  get rebuildLimitEnabled(): boolean {
    return this.rebuildMaxNodes > 0;
  }
}
