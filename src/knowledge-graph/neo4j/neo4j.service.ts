import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, {
  type Driver,
  type ManagedTransaction,
  type RecordShape,
  type ResultSummary,
  type Session,
} from 'neo4j-driver';

import { Neo4jConfigService } from '@/config/neo4j';
import { TRACER, type Tracer } from '@/observability';

import { convertValue } from './neo4j-utils';

interface RunResult<T extends RecordShape> {
  records: T[];
  summary: ResultSummary;
}

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private driver!: Driver;

  constructor(
    private readonly config: Neo4jConfigService,
    @Inject(TRACER) private readonly tracer: Tracer,
  ) {}

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

  /**
   * `operationName` is required and used both as the span name suffix
   * (`neo4j.<operationName>`) and the trace UI label. Convention:
   * `<RepositoryName>.<methodName>` - e.g. `'EntityNode.searchByEmbedding'`.
   */
  async executeRead<T extends RecordShape = RecordShape>(
    operationName: string,
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<T[]> {
    return this.runTraced('READ', operationName, cypher, params, (session) =>
      session.executeRead((tx) => this.runInTx<T>(tx, cypher, params)),
    );
  }

  async executeWrite<T extends RecordShape = RecordShape>(
    operationName: string,
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<T[]> {
    return this.runTraced('WRITE', operationName, cypher, params, (session) =>
      session.executeWrite((tx) => this.runInTx<T>(tx, cypher, params)),
    );
  }

  private async runTraced<T extends RecordShape>(
    operation: 'READ' | 'WRITE',
    operationName: string,
    cypher: string,
    params: Record<string, unknown>,
    work: (session: Session) => Promise<RunResult<T>>,
  ): Promise<T[]> {
    return this.tracer.withSpan(`neo4j.${operationName}`, async (span) => {
      span.setAttributes({
        'db.system': 'neo4j',
        'db.name': this.config.database,
        'db.operation': operation,
        'db.statement': cypher,
        // Keys only - values carry user content / PII.
        'db.params.keys': Object.keys(params).join(','),
      });
      const session = this.driver.session({ database: this.config.database });

      try {
        const { records, summary } = await work(session);
        const counters = summary.counters.updates();
        span.setAttributes({
          'db.neo4j.records_returned': records.length,
          'db.neo4j.nodes_created': counters.nodesCreated,
          'db.neo4j.nodes_deleted': counters.nodesDeleted,
          'db.neo4j.relationships_created': counters.relationshipsCreated,
          'db.neo4j.relationships_deleted': counters.relationshipsDeleted,
          'db.neo4j.properties_set': counters.propertiesSet,
        });
        return records;
      } finally {
        await session.close();
      }
    });
  }

  private async runInTx<T extends RecordShape>(
    tx: ManagedTransaction,
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<RunResult<T>> {
    const result = await tx.run<T>(cypher, params);
    const records = result.records.map((record) => {
      const obj: Record<string, unknown> = {};
      for (const key of record.keys) {
        obj[key as string] = convertValue(record.get(key));
      }
      return obj as T;
    });
    return { records, summary: result.summary };
  }
}
