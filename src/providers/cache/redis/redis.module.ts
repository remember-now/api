import { Module, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as Redis from 'redis';
import { RedisClientType } from 'redis';

import { RedisConfigModule, RedisConfigService } from '@/config/redis';

import { REDIS } from './redis.constants';

@Module({
  imports: [RedisConfigModule],
  providers: [
    {
      provide: REDIS,
      useFactory: async (redisConfig: RedisConfigService) => {
        const client = Redis.createClient({
          url: redisConfig.url,
        });
        await client.connect();
        return client;
      },
      inject: [RedisConfigService],
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
