import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { AuthDto } from './dto';
import { LocalGuard, LoggedInGuard } from './guard';
import { GetUser } from './decorator';
import { UserWithoutPassword } from 'src/user/types';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  registerUser(@Body() dto: AuthDto) {
    return this.authService.registerUser(dto);
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalGuard)
  @Post('login')
  loginUser(@GetUser() user: UserWithoutPassword) {
    return { message: 'Login successful', user };
  }

  @HttpCode(HttpStatus.OK)
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
}
