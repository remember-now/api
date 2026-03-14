import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class Neo4jConfigService {
  constructor(private readonly configService: ConfigService) {}

  get uri(): string {
    return this.configService.get<string>('neo4j.uri')!;
  }

  get username(): string {
    return this.configService.get<string>('neo4j.username')!;
  }

  get password(): string {
    return this.configService.get<string>('neo4j.password')!;
  }

  get database(): string {
    return this.configService.get<string>('neo4j.database')!;
  }
}
