import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, {
  Driver,
  ManagedTransaction,
  RecordShape,
  Session,
} from 'neo4j-driver';

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

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity({ database: this.config.database });
  }

  async executeRead<T extends RecordShape = RecordShape>(
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<T[]> {
    const session: Session = this.driver.session({
      database: this.config.database,
    });
    try {
      return await session.executeRead((tx: ManagedTransaction) =>
        this.runInTx<T>(tx, cypher, params),
      );
    } finally {
      await session.close();
    }
  }

  async executeWrite<T extends RecordShape = RecordShape>(
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<T[]> {
    const session: Session = this.driver.session({
      database: this.config.database,
    });
    try {
      return await session.executeWrite((tx: ManagedTransaction) =>
        this.runInTx<T>(tx, cypher, params),
      );
    } finally {
      await session.close();
    }
  }

  private async runInTx<T extends RecordShape>(
    tx: ManagedTransaction,
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<T[]> {
    const result = await tx.run<T>(cypher, params);
    return result.records.map((record) => {
      const obj: Record<string, unknown> = {};
      for (const key of record.keys) {
        obj[key as string] = convertValue(record.get(key));
      }
      return obj as T;
    });
  }
}
