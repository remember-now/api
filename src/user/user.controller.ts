import { Controller, Get, UseGuards } from '@nestjs/common';
import { User } from 'generated/prisma';
import { GetUser } from 'src/auth/decorator';
import { AdminGuard, LoggedInGuard } from 'src/auth/guard';

@UseGuards(LoggedInGuard)
@Controller('users')
export class UserController {
  @Get('me')
  getMe(@GetUser() user: Partial<User>) {
    return user;
  }

  // TODO: Remove this testing code
  @UseGuards(AdminGuard)
  @Get('admin-only')
  adminOnly() {
    return { message: 'Admin access granted!' };
  }
}
