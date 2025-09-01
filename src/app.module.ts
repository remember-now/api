import {
  Inject,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import * as passport from 'passport';
import * as session from 'express-session';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { APP_INTERCEPTOR, APP_PIPE, APP_FILTER } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { REDIS, RedisModule } from './redis';
import { RedisStore } from 'connect-redis';
import { RedisClientType } from 'redis';
import { UserModule } from './user/user.module';
import { LettaModule } from './letta/letta.module';
import { AgentModule } from './agent/agent.module';
import { BullModule } from '@nestjs/bullmq';
import { HttpExceptionFilter } from './common/http-exception.filter';

const TWO_WEEKS_IN_HOURS = 14 * 24;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
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
        session({
          store: new RedisStore({
            client: this.redis,
          }),
          saveUninitialized: false,
          secret: this.configService.get<string>(
            'SESSION_SECRET',
            'super_secret_value',
          ),
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
