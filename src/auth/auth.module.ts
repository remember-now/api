import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { LocalStrategy } from './strategy';
import { AuthSerializer } from './serializers';
import { PasswordService } from './password.service';

@Module({
  imports: [
    PassportModule.register({
      session: true,
    }),
    UserModule,
  ],
  providers: [AuthService, PasswordService, LocalStrategy, AuthSerializer],
  controllers: [AuthController],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
