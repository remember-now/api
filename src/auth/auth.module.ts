import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { UserModule } from '@/user/user.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { AuthSerializer } from './serializers';
import { LocalStrategy } from './strategy';

@Module({
  imports: [
    PassportModule.register({
      session: true,
    }),
    forwardRef(() => UserModule),
  ],
  providers: [AuthService, PasswordService, LocalStrategy, AuthSerializer],
  controllers: [AuthController],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
