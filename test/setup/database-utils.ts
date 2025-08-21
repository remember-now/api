import { PrismaClient } from 'generated/prisma';

export class DatabaseUtils {
  private static prisma = new PrismaClient();

  static async cleanDatabase(): Promise<void> {
    await this.prisma.user.deleteMany();
  }

  static getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  static async cleanup(): Promise<void> {
    return this.prisma.$disconnect();
  }
}
