import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { LocalGuard } from '../local.guard';
import { AuthService } from './auth.service';
import { AuthDto } from './dto';
import { LoggedInGuard } from 'src/logged-in.guard';
import { AdminGuard } from 'src/admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  registerUser(@Body() dto: AuthDto) {
    return this.authService.registerUser(dto);
  }

  @UseGuards(LocalGuard)
  @Post('login')
  loginUser(@Req() req: Request & { session: any }) {
    return { message: 'Login successful', user: req.user };
  }

  @UseGuards(LoggedInGuard)
  @Post('logout')
  async logoutUser(
    @Req() req: Request & { logout: (done: (err: any) => void) => void },
  ) {
    return new Promise<{ message: string }>((resolve, reject) => {
      req.logout((err) => {
        if (err) {
          reject(new InternalServerErrorException('Logout failed'));
        } else {
          resolve({ message: 'Logout successful' });
        }
      });
    });
  }

  // TODO: Remove test route once User service and Auth is decoupled
  @UseGuards(LoggedInGuard)
  @Get('me')
  getMe(@Req() req: Request) {
    return { user: req.user, message: 'You are authenticated!' };
  }

  // TODO: Remove test route once User service and Auth is decoupled
  @UseGuards(AdminGuard)
  @Get('admin-only')
  adminOnly() {
    return { message: 'Admin access granted!' };
  }
}
