import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { Role, User } from 'generated/prisma';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateSelfDto,
  GetUserParamsDto,
  GetUsersQueryDto,
  DeleteSelfDto,
} from './dto';
import { PaginatedUsers, UserWithoutPassword } from './types';
import { Session as ExpressSession } from 'express-session';
import { AuthService } from 'src/auth/auth.service';

describe('UserController', () => {
  let userController: UserController;
  let userService: DeepMocked<UserService>;
  let authService: DeepMocked<AuthService>;
  let mockSession: DeepMocked<ExpressSession>;

  const mockUser: UserWithoutPassword = {
    id: 1,
    email: 'test@example.com',
    role: Role.USER,
    agentId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
    })
      .useMocker(createMock)
      .compile();

    userController = module.get(UserController);
    userService = module.get(UserService);
    authService = module.get(AuthService);
    mockSession = createMock<ExpressSession>();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(userController).toBeDefined();
  });

  describe('getMe', () => {
    it('should return the current user', () => {
      const result = userController.getMe(mockUser);

      expect(result).toEqual(mockUser);
    });
  });

  describe('updateMe', () => {
    it('should call userService.updateSelf with correct parameters', async () => {
      const updateSelfDto: UpdateSelfDto = {
        email: 'newemail@example.com',
        currentPassword: 'currentPassword123',
      };
      userService.updateSelf.mockResolvedValueOnce(mockUser);
      const result = await userController.updateMe(mockUser, updateSelfDto);

      expect(userService.updateSelf).toHaveBeenCalledWith(
        mockUser.id,
        updateSelfDto,
      );
      expect(userService.updateSelf).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockUser);
    });

    it('should handle update errors', async () => {
      const updateSelfDto: UpdateSelfDto = {
        email: 'newemail@example.com',
        currentPassword: 'currentPassword123',
      };
      const error = new Error('Update failed');
      userService.updateSelf.mockRejectedValueOnce(error);

      await expect(
        userController.updateMe(mockUser, updateSelfDto),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('deleteMe', () => {
    it('should call userService.deleteSelf and authService.destroyUserSession', async () => {
      const deleteSelfDto: DeleteSelfDto = {
        currentPassword: 'currentPassword123',
        confirmationText: 'DELETE MY ACCOUNT',
      };
      userService.deleteSelf.mockResolvedValueOnce(undefined);
      authService.destroyUserSession.mockResolvedValueOnce(undefined);

      const result = await userController.deleteMe(
        mockUser,
        deleteSelfDto,
        mockSession,
      );
      expect(userService.deleteSelf).toHaveBeenCalledWith(
        mockUser.id,
        deleteSelfDto,
      );
      expect(userService.deleteSelf).toHaveBeenCalledTimes(1);

      expect(authService.destroyUserSession).toHaveBeenCalledWith(mockSession);
      expect(authService.destroyUserSession).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });

    it('should handle user deletion errors', async () => {
      const deleteSelfDto: DeleteSelfDto = {
        currentPassword: 'currentPassword123',
        confirmationText: 'DELETE MY ACCOUNT',
      };
      const error = new Error('Deletion failed');
      userService.deleteSelf.mockRejectedValueOnce(error);

      await expect(
        userController.deleteMe(mockUser, deleteSelfDto, mockSession),
      ).rejects.toThrow('Deletion failed');

      expect(authService.destroyUserSession).not.toHaveBeenCalled();
    });

    it('should not fail if session destruction fails', async () => {
      const deleteSelfDto: DeleteSelfDto = {
        currentPassword: 'currentPassword123',
        confirmationText: 'DELETE MY ACCOUNT',
      };

      userService.deleteSelf.mockResolvedValueOnce(undefined);
      authService.destroyUserSession.mockRejectedValueOnce(
        new Error('Session error'),
      );
      const loggerSpy = jest
        .spyOn(userController['logger'], 'error')
        .mockImplementation(() => {});

      await expect(
        userController.deleteMe(mockUser, deleteSelfDto, mockSession),
      ).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to destroy session after account deletion',
        expect.any(Error),
      );
    });
  });

  describe('createUser (Admin only)', () => {
    it('should call userService.createUserWithDto with correct parameters', async () => {
      const createUserDto: CreateUserDto = {
        email: 'admin@example.com',
        password: 'password123',
        role: Role.ADMIN,
      };
      const createUserResult = {
        id: 1,
        email: 'admin@example.com',
        role: Role.ADMIN,
        agentId: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      userService.createUserWithDto.mockResolvedValueOnce(createUserResult);

      const result = await userController.createUser(createUserDto);

      expect(userService.createUserWithDto).toHaveBeenCalledWith(createUserDto);
      expect(userService.createUserWithDto).toHaveBeenCalledTimes(1);
      expect(result).toEqual(createUserResult);
    });

    it('should handle creation errors', async () => {
      const createUserDto: CreateUserDto = {
        email: 'admin@example.com',
        password: 'password123',
        role: Role.ADMIN,
      };
      const error = new Error('Creation failed');
      userService.createUserWithDto.mockRejectedValueOnce(error);

      await expect(userController.createUser(createUserDto)).rejects.toThrow(
        'Creation failed',
      );
    });
  });

  describe('getAllUsers (Admin only)', () => {
    it('should call userService.getAllUsers with correct query parameters', async () => {
      const query: GetUsersQueryDto = {
        page: 1,
        limit: 10,
        search: 'test',
      };

      const mockPaginatedUsers: PaginatedUsers = {
        users: [mockUser],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      userService.getAllUsers.mockResolvedValueOnce(mockPaginatedUsers);

      const result = await userController.getAllUsers(query);

      expect(userService.getAllUsers).toHaveBeenCalledWith(query);
      expect(userService.getAllUsers).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockPaginatedUsers);
    });

    it('should handle query errors', async () => {
      const query: GetUsersQueryDto = {
        page: 1,
        limit: 10,
      };
      const error = new Error('Query failed');
      userService.getAllUsers.mockRejectedValueOnce(error);

      await expect(userController.getAllUsers(query)).rejects.toThrow(
        'Query failed',
      );
    });
  });

  describe('getUserById (Admin only)', () => {
    it('should call userService.getUserById with correct parameters', async () => {
      const params: GetUserParamsDto = { id: 1 };
      const mockFullUser: User = {
        ...mockUser,
        passwordHash: 'hashedPassword',
      };

      userService.getUserById.mockResolvedValueOnce(mockFullUser);

      const result = await userController.getUserById(params);

      expect(userService.getUserById).toHaveBeenCalledWith(params.id);
      expect(userService.getUserById).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockFullUser);
    });

    it('should handle user not found errors', async () => {
      const params: GetUserParamsDto = { id: 999 };
      const error = new Error('User not found');
      userService.getUserById.mockRejectedValueOnce(error);

      await expect(userController.getUserById(params)).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('updateUser (Admin only)', () => {
    it('should call userService.updateUser with correct parameters', async () => {
      const params: GetUserParamsDto = { id: 1 };
      const updateUserDto: UpdateUserDto = {
        email: 'updated@example.com',
        role: Role.ADMIN,
      };
      userService.updateUser.mockResolvedValueOnce(mockUser);

      const result = await userController.updateUser(params, updateUserDto);

      expect(userService.updateUser).toHaveBeenCalledWith(
        params.id,
        updateUserDto,
      );
      expect(userService.updateUser).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockUser);
    });

    it('should handle update errors', async () => {
      const params: GetUserParamsDto = { id: 1 };
      const updateUserDto: UpdateUserDto = {
        email: 'updated@example.com',
      };
      const error = new Error('Update failed');
      userService.updateUser.mockRejectedValueOnce(error);

      await expect(
        userController.updateUser(params, updateUserDto),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('deleteUser (Admin only)', () => {
    it('should call userService.deleteUser with correct parameters', async () => {
      const params: GetUserParamsDto = { id: 1 };

      userService.deleteUser.mockResolvedValueOnce(undefined);

      const result = await userController.deleteUser(params);

      expect(userService.deleteUser).toHaveBeenCalledWith(params.id);
      expect(userService.deleteUser).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });

    it('should handle deletion errors', async () => {
      const params: GetUserParamsDto = { id: 1 };
      const error = new Error('Deletion failed');
      userService.deleteUser.mockRejectedValueOnce(error);

      await expect(userController.deleteUser(params)).rejects.toThrow(
        'Deletion failed',
      );
    });
  });
});
