import { PrismaClient } from '@generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.APP_DATABASE_URL });
const adapter = new PrismaPg(pool);

export class DatabaseUtils {
  private static prisma = new PrismaClient({ adapter });
  private static pool = pool;

  static async cleanDatabase(): Promise<void> {
    await this.prisma.user.deleteMany();
  }

  static getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  static async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
