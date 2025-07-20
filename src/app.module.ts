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
import { ZodValidationPipe } from 'nestjs-zod';
import { APP_PIPE } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { REDIS, RedisModule } from './redis';
import { RedisStore } from 'connect-redis';
import { RedisClientType } from 'redis';
import { UserModule } from './user/user.module';

const TWO_WEEKS_IN_HOURS = 14 * 24;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    UserModule,
    AuthModule,
  ],
  providers: [
    Logger,
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
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
          resave: true,
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
