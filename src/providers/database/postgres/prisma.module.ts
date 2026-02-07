import { Global, Module } from '@nestjs/common';

import { PostgresConfigModule } from '@/config/postgres';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [PostgresConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
