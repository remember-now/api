import { Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Redis from 'redis';
import { REDIS } from './redis.constants';
import { ModuleRef } from '@nestjs/core';
import { RedisClientType } from 'redis';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      useFactory: async (configService: ConfigService) => {
        const client = Redis.createClient({
          url: configService.get<string>('REDIS_URL'),
        });
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(private moduleRef: ModuleRef) {}

  async onModuleDestroy() {
    const redisClient = this.moduleRef.get<RedisClientType>(REDIS);
    await redisClient.quit();
  }
}
