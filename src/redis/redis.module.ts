import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Redis from 'redis';
import { REDIS } from './redis.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      useFactory: async (configService: ConfigService) => {
        const client = Redis.createClient({
          socket: {
            port: configService.get<number>('REDIS_PORT', 6379),
            host: configService.get<string>('REDIS_HOST', 'localhost'),
          },
          password: configService.get<string>('REDIS_PASSWORD'),
        });
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
