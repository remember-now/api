import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthDto } from './dto';
import { InternalServerErrorException } from '@nestjs/common';
import { Role } from 'generated/prisma';
import { Request } from 'express';
import { UserWithoutPassword } from 'src/user/types';

describe('AuthController', () => {
  let authController: AuthController;
  let authService: DeepMocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
    })
      .useMocker(createMock)
      .compile();

    authController = module.get(AuthController);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authController).toBeDefined();
  });

  describe('registerUser', () => {
    it('should call authService.registerUser with correct parameters', async () => {
      const authDto: AuthDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult: UserWithoutPassword = {
        id: 1,
        email: 'test@example.com',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      authService.registerUser.mockResolvedValueOnce(expectedResult);

      const result = await authController.registerUser(authDto);

      expect(authService.registerUser).toHaveBeenCalledWith(authDto);
      expect(authService.registerUser).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    it('should handle registration errors', async () => {
      const authDto: AuthDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const error = new Error('Registration failed');
      authService.registerUser.mockRejectedValueOnce(error);

      await expect(authController.registerUser(authDto)).rejects.toThrow(
        'Registration failed',
      );
    });
  });

  describe('loginUser', () => {
    it('should return login success message with user data', () => {
      const mockRequest = createMock<Request>({
        user: {
          id: 1,
          email: 'test@example.com',
          role: Role.USER,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {},
      });
      const result = authController.loginUser(mockRequest);

      expect(result).toEqual({
        message: 'Login successful',
        user: {
          id: 1,
          email: 'test@example.com',
          role: Role.USER,
          createdAt: expect.any(Date) as Date,
          updatedAt: expect.any(Date) as Date,
        },
      });
    });
  });

  describe('logoutUser', () => {
    it('should successfully logout user', async () => {
      const mockLogout = jest.fn<void, [(err: any) => void]>((callback) =>
        callback(null),
      );

      const mockRequest = createMock<Request>({
        logout: mockLogout,
      });
      const result = await authController.logoutUser(mockRequest);

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ message: 'Logout successful' });
    });

    it('should handle logout errors', async () => {
      const mockLogout = jest.fn<void, [(err: any) => void]>((callback) =>
        callback(new Error('Logout error')),
      );
      const mockRequest = createMock<Request>({
        logout: mockLogout,
      });

      await expect(authController.logoutUser(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(authController.logoutUser(mockRequest)).rejects.toThrow(
        'Logout failed',
      );
    });
  });
});
