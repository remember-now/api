import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  UseGuards,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Session,
  Logger,
} from '@nestjs/common';
import { GetUser } from 'src/auth/decorator';
import { AdminGuard, LoggedInGuard } from 'src/auth/guard';
import { UserService } from './user.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateSelfDto,
  GetUserParamsDto,
  GetUsersQueryDto,
  DeleteSelfDto,
} from './dto';
import { UserWithoutPassword } from './types';
import { Session as ExpressSession } from 'express-session';
import { AuthService } from 'src/auth/auth.service';

@UseGuards(LoggedInGuard)
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Get('me')
  getMe(@GetUser() user: UserWithoutPassword) {
    return user;
  }

  @Put('me')
  updateMe(@GetUser() user: UserWithoutPassword, @Body() dto: UpdateSelfDto) {
    return this.userService.updateSelf(user.id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(
    @GetUser() user: UserWithoutPassword,
    @Body() dto: DeleteSelfDto,
    @Session() session: ExpressSession,
  ) {
    await this.userService.deleteSelf(user.id, dto);

    try {
      await this.authService.destroyUserSession(session);
    } catch (error) {
      this.logger.error(
        'Failed to destroy session after account deletion',
        error,
      );
    }
  }

  @UseGuards(AdminGuard)
  @Post()
  createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUserWithDto(dto);
  }

  @UseGuards(AdminGuard)
  @Get()
  getAllUsers(@Query() query: GetUsersQueryDto) {
    return this.userService.getAllUsers(query);
  }

  @UseGuards(AdminGuard)
  @Get(':id')
  getUserById(@Param() params: GetUserParamsDto) {
    return this.userService.getUserById(params.id);
  }

  @UseGuards(AdminGuard)
  @Put(':id')
  updateUser(@Param() params: GetUserParamsDto, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(params.id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Param() params: GetUserParamsDto) {
    return this.userService.deleteUser(params.id);
  }
}
