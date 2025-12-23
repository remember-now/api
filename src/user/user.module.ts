import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { QueueNames } from '@/common/constants';

import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    BullModule.registerQueue({
      name: QueueNames.AGENT_PROVISIONING,
    }),
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
