import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PostgresConfigService {
  constructor(private readonly configService: ConfigService) {}

  get databaseUrl(): string {
    return this.configService.get<string>('postgres.databaseUrl')!;
  }
}
