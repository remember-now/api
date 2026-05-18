import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LangfuseConfigService {
  constructor(private readonly configService: ConfigService) {}

  get enabled(): boolean {
    return this.configService.get<boolean>('langfuse.enabled')!;
  }

  get publicKey(): string | undefined {
    return this.configService.get<string>('langfuse.publicKey');
  }

  get secretKey(): string | undefined {
    return this.configService.get<string>('langfuse.secretKey');
  }

  get baseUrl(): string {
    return this.configService.get<string>('langfuse.baseUrl')!;
  }

  get environment(): string {
    return this.configService.get<string>('langfuse.environment')!;
  }
}
