import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OtelConfigService {
  constructor(private readonly configService: ConfigService) {}

  get telemetryEnabled(): boolean {
    return this.configService.get<boolean>('otel.telemetryEnabled')!;
  }

  get consoleExportEnabled(): boolean {
    return this.configService.get<boolean>('otel.consoleExportEnabled')!;
  }
}
