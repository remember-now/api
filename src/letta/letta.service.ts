import { LettaClient } from '@letta-ai/letta-client';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LettaService extends LettaClient {
  constructor(configService: ConfigService) {
    super({
      baseUrl: configService.getOrThrow<string>('LETTA_URL'),
      token: configService.getOrThrow<string>('LETTA_PASS'),
      project: 'RememberNow',
    });
  }
}
