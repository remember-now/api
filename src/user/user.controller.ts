import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { User } from 'generated/prisma';
import { AdminGuard } from 'src/admin.guard';
import { LoggedInGuard } from 'src/logged-in.guard';

@Controller('user')
export class UserController {
  @UseGuards(LoggedInGuard)
  @Get('me')
  getMe(@Req() req: Request & { user: Partial<User> }) {
    return { user: req.user, message: 'You are authenticated!' };
  }

  // TODO: Remove this testing code
  @UseGuards(AdminGuard)
  @Get('admin-only')
  adminOnly() {
    return { message: 'Admin access granted!' };
  }
}
