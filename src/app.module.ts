import {
  Inject,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { RedisStore } from 'connect-redis';
import * as session from 'express-session';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import * as passport from 'passport';
import { RedisClientType } from 'redis';

import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter, SilentExceptionFilter } from './common';
import { AppConfigModule, AppConfigService } from './config/app';
import { LlmConfigModule } from './config/llm';
import { PostgresConfigModule } from './config/postgres';
import { RedisConfigModule } from './config/redis';
// import { LlmModule } from './llm/llm.module';
import { MemoriesModule } from './memories/memories.module';
import { MessagesModule } from './messages/messages.module';
import { REDIS, RedisModule } from './providers/cache/redis';
import { PrismaModule } from './providers/database/postgres';
import { QueueModule } from './providers/queue/bullmq';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    AppConfigModule,
    LlmConfigModule,
    RedisConfigModule,
    PostgresConfigModule,
    QueueModule,
    PrismaModule,
    RedisModule,
    UserModule,
    AuthModule,
    AgentModule,
    MessagesModule,
    MemoriesModule,
    // LlmModule,
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
    private readonly appConfig: AppConfigService,
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
          secret: this.appConfig.sessionSecret,
          resave: false,
          rolling: true,
          cookie: {
            sameSite: true,
            httpOnly: false,
            maxAge: this.appConfig.sessionExpiryHours * 60 * 60 * 1000,
          },
        }),
        passport.initialize(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        passport.session(),
      )
      .forRoutes('*');
  }
}
