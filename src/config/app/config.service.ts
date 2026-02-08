import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Environment } from './configuration';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get env(): Environment {
    return this.configService.get<Environment>('app.env')!;
  }

  get port(): number {
    return this.configService.get<number>('app.port')!;
  }

  get frontendUrl(): string {
    return this.configService.get<string>('app.frontendUrl')!;
  }

  get sessionSecret(): string {
    return this.configService.get<string>('app.sessionSecret')!;
  }

  get sessionExpiryHours(): number {
    return this.configService.get<number>('app.sessionExpiryHours')!;
  }
}
