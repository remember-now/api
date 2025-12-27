import Letta from '@letta-ai/letta-client';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LettaService extends Letta {
  constructor(configService: ConfigService) {
    super({
      baseURL: configService.getOrThrow<string>('LETTA_URL'),
      apiKey: configService.getOrThrow<string>('LETTA_PASS'),
      projectID: 'RememberNow',
    });
  }
}
