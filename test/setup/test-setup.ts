import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { DatabaseUtils } from './database-utils';

export class TestSetup {
  static app: INestApplication;
  static baseUrl = `http://localhost:${process.env.PORT ?? 3333}`;

  static async setupApp(): Promise<void> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    this.app = moduleFixture.createNestApplication();
    await this.app.init();
    await this.app.listen(process.env.PORT ?? 3333);

    await DatabaseUtils.cleanDatabase();
  }

  static async teardownApp(): Promise<void> {
    await DatabaseUtils.cleanDatabase();
    await DatabaseUtils.cleanup();
    await this.app.close();
  }
}
