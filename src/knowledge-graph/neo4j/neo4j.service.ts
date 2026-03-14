import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';

import { Neo4jConfigService } from '@/config/neo4j';

import { convertValue } from './neo4j-utils';

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private driver!: Driver;

  constructor(private readonly config: Neo4jConfigService) {}

  onModuleInit(): void {
    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.username, this.config.password),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver.close();
  }

  async runQuery<T extends Record<string, unknown>>(
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<T[]> {
    const session: Session = this.driver.session({
      database: this.config.database,
    });
    try {
      const result = await session.run(cypher, params);

      return result.records.map((record) => {
        const obj: Record<string, unknown> = {};
        for (const key of record.keys) {
          obj[key as string] = convertValue(record.get(key as string));
        }
        return obj as T;
      });
    } finally {
      await session.close();
    }
  }
}
