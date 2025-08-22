import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { UserService } from './user.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PasswordService } from 'src/auth/password.service';
import { Role, User } from 'generated/prisma';
import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
import {
  UpdateUserDto,
  UpdateSelfDto,
  GetUsersQueryDto,
  DeleteSelfDto,
} from './dto';
import { UserFactory, UserDtoFactory } from 'src/test/factories';
import { QueueNames } from 'src/common/constants';

describe('UserService', () => {
  let userService: UserService;
  let prismaService: DeepMockProxy<PrismaService>;
  let passwordService: DeepMockProxy<PasswordService>;

  const mockUser = UserFactory.createUser();
  const mockUserWithoutPassword = UserFactory.createUserWithoutPassword();

  const mockQueue = {
    add: jest.fn(),
    process: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getQueueToken(QueueNames.AGENT_PROVISIONING),
          useValue: mockQueue,
        },
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaService>(),
        },
        {
          provide: PasswordService,
          useValue: mockDeep<PasswordService>(),
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
    prismaService = module.get<PrismaService>(
      PrismaService,
    ) as DeepMockProxy<PrismaService>;
    passwordService = module.get<PasswordService>(
      PasswordService,
    ) as DeepMockProxy<PasswordService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockReset(prismaService);
    mockReset(passwordService);
    mockQueue.add.mockClear();
  });

  it('should be defined', () => {
    expect(userService).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a user successfully and enqueue agent creation', async () => {
      prismaService.user.create.mockResolvedValueOnce(mockUser);

      const result = await userService.createUser(
        'test@example.com',
        'hashedPassword',
        Role.USER,
      );

      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          passwordHash: 'hashedPassword',
          role: Role.USER,
        },
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'create-agent',
        { userId: mockUser.id },
        expect.any(Object),
      );
      expect(result).toEqual(mockUserWithoutPassword);
    });

    it('should throw ForbiddenException when email is already taken', async () => {
      const prismaError = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
        },
      );
      prismaService.user.create.mockRejectedValueOnce(prismaError);

      await expect(
        userService.createUser('test@example.com', 'hashedPassword', Role.USER),
      ).rejects.toThrow(new ForbiddenException('Credentials taken'));
    });

    it('should rethrow unknown errors', async () => {
      const unknownError = new Error('Database connection failed');
      prismaService.user.create.mockRejectedValueOnce(unknownError);

      await expect(
        userService.createUser('test@example.com', 'hashedPassword', Role.USER),
      ).rejects.toThrow(unknownError);
    });
  });

  describe('createUserWithDto', () => {
    it('should hash password and create user', async () => {
      const createUserDto = UserDtoFactory.createCreateUserDto({
        email: 'test@example.com',
        role: Role.USER,
      });
      const hashedPassword = 'hashedPassword123';

      passwordService.hash.mockResolvedValueOnce(hashedPassword);
      prismaService.user.create.mockResolvedValueOnce(mockUser);

      const result = await userService.createUserWithDto(createUserDto);

      expect(passwordService.hash).toHaveBeenCalledWith(createUserDto.password);
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: createUserDto.email,
          passwordHash: hashedPassword,
          role: createUserDto.role,
        },
      });
      expect(result).toEqual(mockUserWithoutPassword);
    });
  });

  describe('getAllUsers', () => {
    const mockPaginatedResult = {
      users: [mockUserWithoutPassword],
      pagination: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    };

    it('should return paginated users without search', async () => {
      const query: GetUsersQueryDto = {
        page: 1,
        limit: 10,
      };
      prismaService.user.count.mockResolvedValueOnce(1);
      prismaService.user.findMany.mockResolvedValueOnce([
        mockUserWithoutPassword,
      ] as User[]);

      const result = await userService.getAllUsers(query);

      expect(prismaService.user.count).toHaveBeenCalledWith({ where: {} });
      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          agentId: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should return paginated users with search', async () => {
      const query: GetUsersQueryDto = {
        page: 1,
        limit: 10,
        search: 'test',
      };

      const expectedWhere = {
        email: {
          contains: 'test',
          mode: 'insensitive' as const,
        },
      };

      prismaService.user.count.mockResolvedValueOnce(1);
      prismaService.user.findMany.mockResolvedValueOnce([
        mockUserWithoutPassword,
      ] as User[]);

      const result = await userService.getAllUsers(query);

      expect(prismaService.user.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        skip: 0,
        take: 10,
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          agentId: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should calculate pagination correctly for multiple pages', async () => {
      const query: GetUsersQueryDto = {
        page: 2,
        limit: 5,
      };

      prismaService.user.count.mockResolvedValueOnce(12);
      prismaService.user.findMany.mockResolvedValueOnce([mockUser]);

      const result = await userService.getAllUsers(query);

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (page - 1) * limit = (2 - 1) * 5 = 5
          take: 5,
        }),
      );
      expect(result.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3, // Math.ceil(12 / 5) = 3
        hasNext: true, // page 2 < totalPages 3
        hasPrev: true, // page 2 > 1
      });
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);

      const result = await userService.getUserById(1);

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user not found', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(userService.getUserById(999)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  describe('getUserByEmail', () => {
    it('should return user when found', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);

      const result = await userService.getUserByEmail('test@example.com');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user not found', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        userService.getUserByEmail('notfound@example.com'),
      ).rejects.toThrow(new NotFoundException('User not found'));
    });
  });

  describe('updateUser', () => {
    it('should update user with email only', async () => {
      const updateDto: UpdateUserDto = {
        email: 'updated@example.com',
      };

      prismaService.user.update.mockResolvedValueOnce({
        ...mockUser,
        email: 'updated@example.com',
      });

      const result = await userService.updateUser(1, updateDto);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { email: 'updated@example.com' },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          agentId: true,
        },
      });
      expect(result.email).toBe('updated@example.com');
    });

    it('should update user with password only', async () => {
      const updateDto: UpdateUserDto = {
        password: 'newPassword123',
      };
      const hashedPassword = 'hashedNewPassword';

      passwordService.hash.mockResolvedValueOnce(hashedPassword);
      prismaService.user.update.mockResolvedValueOnce(mockUser);

      await userService.updateUser(1, updateDto);

      expect(passwordService.hash).toHaveBeenCalledWith('newPassword123');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: hashedPassword },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          agentId: true,
        },
      });
    });

    it('should update user with role only', async () => {
      const updateDto: UpdateUserDto = {
        role: Role.ADMIN,
      };

      prismaService.user.update.mockResolvedValueOnce({
        ...mockUser,
        role: Role.ADMIN,
      });

      await userService.updateUser(1, updateDto);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { role: Role.ADMIN },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          agentId: true,
        },
      });
    });

    it('should throw ForbiddenException when email is already taken', async () => {
      const updateDto: UpdateUserDto = {
        email: 'taken@example.com',
      };

      const prismaError = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
        },
      );
      prismaService.user.update.mockRejectedValueOnce(prismaError);

      await expect(userService.updateUser(1, updateDto)).rejects.toThrow(
        new ForbiddenException('Email already taken'),
      );
    });

    it('should throw NotFoundException when a user is not found', async () => {
      const updateDto: UpdateUserDto = {
        email: 'taken@example.com',
      };

      const prismaError = new PrismaClientKnownRequestError('User not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      prismaService.user.update.mockRejectedValueOnce(prismaError);

      await expect(userService.updateUser(1, updateDto)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  describe('updateSelf', () => {
    it('should update self when current password is correct', async () => {
      const updateDto: UpdateSelfDto = {
        email: 'newemail@example.com',
        currentPassword: 'currentPassword123',
      };

      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      passwordService.verify.mockResolvedValueOnce(true);
      prismaService.user.update.mockResolvedValueOnce({
        ...mockUser,
        email: 'newemail@example.com',
      });

      const result = await userService.updateSelf(1, updateDto);

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(passwordService.verify).toHaveBeenCalledWith(
        mockUser.passwordHash,
        'currentPassword123',
      );
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { email: 'newemail@example.com' },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          agentId: true,
        },
      });
      expect(result.email).toBe('newemail@example.com');
    });

    it('should update password when current password is correct', async () => {
      const updateDto: UpdateSelfDto = {
        password: 'newPassword123',
        currentPassword: 'currentPassword123',
      };
      const hashedNewPassword = 'hashedNewPassword';

      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      passwordService.verify.mockResolvedValueOnce(true);
      passwordService.hash.mockResolvedValueOnce(hashedNewPassword);
      prismaService.user.update.mockResolvedValueOnce(mockUser);

      await userService.updateSelf(1, updateDto);

      expect(passwordService.hash).toHaveBeenCalledWith('newPassword123');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: hashedNewPassword },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          agentId: true,
        },
      });
    });

    it('should throw ForbiddenException when current password is incorrect', async () => {
      const updateDto: UpdateSelfDto = {
        email: 'newemail@example.com',
        currentPassword: 'wrongPassword',
      };

      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      passwordService.verify.mockResolvedValueOnce(false);

      await expect(userService.updateSelf(1, updateDto)).rejects.toThrow(
        new ForbiddenException('Current password is incorrect'),
      );

      expect(prismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when email is already taken', async () => {
      const updateDto: UpdateSelfDto = {
        email: 'taken@example.com',
        currentPassword: 'currentPassword123',
      };

      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      passwordService.verify.mockResolvedValueOnce(true);

      const prismaError = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
        },
      );
      prismaService.user.update.mockRejectedValueOnce(prismaError);

      await expect(userService.updateSelf(1, updateDto)).rejects.toThrow(
        new ForbiddenException('Email already taken'),
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully and enqueue agent deletion', async () => {
      const userWithAgent = UserFactory.createUser({
        agentId: 'test-agent-id',
      });
      prismaService.user.findUnique.mockResolvedValueOnce(userWithAgent);
      prismaService.user.delete.mockResolvedValueOnce(userWithAgent);

      await userService.deleteUser(1);

      expect(prismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'delete-agent',
        { userId: 1, agentId: 'test-agent-id' },
        expect.any(Object),
      );
    });

    it('should delete user without agentId and not enqueue agent deletion', async () => {
      const userWithoutAgent = UserFactory.createUser({ agentId: null });
      prismaService.user.findUnique.mockResolvedValueOnce(userWithoutAgent);
      prismaService.user.delete.mockResolvedValueOnce(userWithoutAgent);

      await userService.deleteUser(1);

      expect(prismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when a user is not found', async () => {
      prismaService.user.delete.mockRejectedValueOnce(
        new PrismaClientKnownRequestError('User not found', {
          code: 'P2025',
          clientVersion: '123',
        }),
      );

      await expect(userService.deleteUser(1)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });

    it('should handle deletion errors', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);

      const error = new Error('Deletion failed');
      prismaService.user.delete.mockRejectedValueOnce(error);

      await expect(userService.deleteUser(1)).rejects.toThrow(error);
    });
  });

  describe('deleteSelf', () => {
    it('should delete self when current password is correct and enqueue agent deletion', async () => {
      const deleteDto: DeleteSelfDto = {
        currentPassword: 'currentPassword123',
        confirmationText: 'DELETE MY ACCOUNT',
      };

      const userWithAgent = UserFactory.createUser({
        agentId: 'test-agent-id',
      });
      prismaService.user.findUnique.mockResolvedValueOnce(userWithAgent);
      passwordService.verify.mockResolvedValueOnce(true);
      prismaService.user.delete.mockResolvedValueOnce(userWithAgent);

      await userService.deleteSelf(1, deleteDto);

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(passwordService.verify).toHaveBeenCalledWith(
        userWithAgent.passwordHash,
        'currentPassword123',
      );
      expect(prismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'delete-agent',
        { userId: 1, agentId: 'test-agent-id' },
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException when current password is incorrect', async () => {
      const deleteDto: DeleteSelfDto = {
        currentPassword: 'wrongPassword',
        confirmationText: 'DELETE MY ACCOUNT',
      };

      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      passwordService.verify.mockResolvedValueOnce(false);

      await expect(userService.deleteSelf(1, deleteDto)).rejects.toThrow(
        new ForbiddenException('Current password is incorrect'),
      );

      expect(prismaService.user.delete).not.toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      const deleteDto: DeleteSelfDto = {
        currentPassword: 'currentPassword123',
        confirmationText: 'DELETE MY ACCOUNT',
      };

      prismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      passwordService.verify.mockResolvedValueOnce(true);

      const error = new Error('Deletion failed');
      prismaService.user.delete.mockRejectedValueOnce(error);

      await expect(userService.deleteSelf(1, deleteDto)).rejects.toThrow(error);
    });
  });

  describe('updateUserAgentId', () => {
    it('should update user agentId successfully', async () => {
      const agentId = 'agent-123';
      const updatedUser = { ...mockUser, agentId };

      prismaService.user.update.mockResolvedValueOnce(updatedUser);

      await userService.updateUserAgentId(1, agentId);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { agentId },
      });
    });

    it('should set agentId to null successfully', async () => {
      const updatedUser = { ...mockUser, agentId: null };

      prismaService.user.update.mockResolvedValueOnce(updatedUser);

      await userService.updateUserAgentId(1, null);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { agentId: null },
      });
    });

    it('should throw NotFoundException when user is not found', async () => {
      const prismaError = new PrismaClientKnownRequestError('User not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      prismaService.user.update.mockRejectedValueOnce(prismaError);

      await expect(
        userService.updateUserAgentId(999, 'agent-123'),
      ).rejects.toThrow(new NotFoundException('User not found'));

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 999 },
        data: { agentId: 'agent-123' },
      });
    });

    it('should rethrow unknown errors', async () => {
      const unknownError = new Error('Database connection failed');
      prismaService.user.update.mockRejectedValueOnce(unknownError);

      await expect(
        userService.updateUserAgentId(1, 'agent-123'),
      ).rejects.toThrow(unknownError);
    });
  });
});
