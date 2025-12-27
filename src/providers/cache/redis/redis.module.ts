import { Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import * as Redis from 'redis';
import { RedisClientType } from 'redis';

import { REDIS } from './redis.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      useFactory: async (configService: ConfigService) => {
        const client = Redis.createClient({
          url: configService.getOrThrow<string>('REDIS_URL'),
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
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}
