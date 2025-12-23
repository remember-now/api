import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthModule } from '@/auth/auth.module';
import { QueueNames } from '@/common/constants';

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
