import { Role } from 'generated/prisma';
import { CreateUserDto, UpdateSelfDto, DeleteSelfDto } from 'src/user/dto';

export class UserDtoFactory {
  static createCreateUserDto(
    options: Partial<CreateUserDto> = {},
  ): CreateUserDto {
    return {
      email: 'admin@example.com',
      password: 'password123',
      role: Role.ADMIN,
      ...options,
    };
  }

  static createUpdateSelfDto(
    options: Partial<UpdateSelfDto> = {},
  ): UpdateSelfDto {
    return {
      email: 'newemail@example.com',
      currentPassword: 'currentPassword123',
      ...options,
    };
  }

  static createDeleteSelfDto(
    options: Partial<DeleteSelfDto> = {},
  ): DeleteSelfDto {
    return {
      currentPassword: 'currentPassword123',
      confirmationText: 'DELETE MY ACCOUNT',
      ...options,
    };
  }
}
