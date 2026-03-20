import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingConfigService {
  constructor(private readonly configService: ConfigService) {}

  get embeddingEnabled(): boolean {
    return this.configService.get<boolean>('embedding.embeddingEnabled')!;
  }

  get apiKey(): string | undefined {
    return this.configService.get<string>('embedding.apiKey');
  }

  get model(): string {
    return this.configService.get<string>('embedding.model')!;
  }
}
