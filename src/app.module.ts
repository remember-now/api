import { BullModule } from '@nestjs/bullmq';
import {
  Inject,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { RedisStore } from 'connect-redis';
import * as session from 'express-session';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import * as passport from 'passport';
import { RedisClientType } from 'redis';

import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter, SilentExceptionFilter } from './common';
import { LettaModule } from './letta/letta.module';
import { MemoriesModule } from './memories/memories.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { REDIS, RedisModule } from './redis';
import { UserModule } from './user/user.module';

const TWO_WEEKS_IN_HOURS = 14 * 24;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, expandVariables: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.getOrThrow<string>('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    UserModule,
    AuthModule,
    LettaModule,
    AgentModule,
    MessagesModule,
    MemoriesModule,
  ],
  providers: [
    Logger,
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: SilentExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  constructor(
    @Inject(REDIS) private readonly redis: RedisClientType,
    private readonly configService: ConfigService,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - express-session works with namespace import at runtime
        session({
          store: new RedisStore({
            client: this.redis,
          }),
          saveUninitialized: false,
          secret: this.configService.getOrThrow<string>('SESSION_SECRET'),
          resave: false,
          rolling: true,
          cookie: {
            sameSite: true,
            httpOnly: false,
            maxAge:
              this.configService.get<number>(
                'SESSION_EXPIRY_HOURS',
                TWO_WEEKS_IN_HOURS,
              ) *
              60 *
              60 *
              1000,
          },
        }),
        passport.initialize(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        passport.session(),
      )
      .forRoutes('*');
  }
}
