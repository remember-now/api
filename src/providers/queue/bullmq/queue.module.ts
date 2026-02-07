import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { RedisConfigModule, RedisConfigService } from '@/config/redis';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [RedisConfigModule],
      useFactory: (redisConfig: RedisConfigService) => ({
        connection: {
          url: redisConfig.url,
        },
      }),
      inject: [RedisConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
