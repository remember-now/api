import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@generated/prisma/client';

import { PasswordService } from '@/auth/password.service';
import { PrismaService } from '@/providers/database/postgres';

import {
  CreateUserDto,
  DeleteSelfDto,
  GetUsersQueryDto,
  PaginatedUsers,
  Role,
  UpdateSelfDto,
  UpdateUserDto,
  User,
  UserWithoutPassword,
} from './dto';

const PrismaClientKnownRequestError = Prisma.PrismaClientKnownRequestError;

@Injectable()
export class UserService {
  // private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  private transformUserDates<T extends { createdAt: Date; updatedAt: Date }>(
    user: T,
  ): Omit<T, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
  } {
    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async createUser(
    email: string,
    passwordHash: string,
    role: Role = 'USER',
  ): Promise<UserWithoutPassword> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: email,
          passwordHash: passwordHash,
          role: role,
        },
      });

      const { passwordHash: _, ...userWithoutPassword } =
        this.transformUserDates(user);
      return userWithoutPassword;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException('Credentials taken');
        }
      }
      throw error;
    }
  }

  async createUserWithDto(dto: CreateUserDto): Promise<UserWithoutPassword> {
    const hash = await this.passwordService.hash(dto.password);
    return this.createUser(dto.email, hash, dto.role);
  }

  async getAllUsers(query: GetUsersQueryDto): Promise<PaginatedUsers> {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          email: {
            contains: search,
            mode: 'insensitive' as const,
          },
        }
      : {};

    const total = await this.prisma.user.count({ where });

    const users = await this.prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
    const totalPages = Math.ceil(total / limit);

    return {
      users: users.map((user) => {
        const { passwordHash: _, ...rest } = this.transformUserDates(user);
        return rest;
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getUserById(id: number): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.transformUserDates(user);
  }

  async getUserByEmail(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.transformUserDates(user);
  }

  async updateUser(
    id: number,
    dto: UpdateUserDto,
  ): Promise<UserWithoutPassword> {
    const updateData: Partial<User> = {};

    if (dto.email) {
      updateData.email = dto.email;
    }
    if (dto.password) {
      updateData.passwordHash = await this.passwordService.hash(dto.password);
    }
    if (dto.role) {
      updateData.role = dto.role;
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: updateData,
      });
      const { passwordHash: _, ...userWithoutPassword } =
        this.transformUserDates(updatedUser);
      return userWithoutPassword;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException('Email already taken');
        }
        if (error.code === 'P2025') {
          throw new NotFoundException('User not found');
        }
      }
      throw error;
    }
  }

  async updateSelf(
    userId: number,
    dto: UpdateSelfDto,
  ): Promise<UserWithoutPassword> {
    const existingUser = await this.getUserById(userId);

    const pwMatches = await this.passwordService.verify(
      existingUser.passwordHash,
      dto.currentPassword,
    );
    if (!pwMatches) {
      throw new ForbiddenException('Current password is incorrect');
    }
    const updateData: Partial<User> = {};

    if (dto.email) {
      updateData.email = dto.email;
    }
    if (dto.password) {
      updateData.passwordHash = await this.passwordService.hash(dto.password);
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
      const { passwordHash: _, ...userWithoutPassword } =
        this.transformUserDates(updatedUser);
      return userWithoutPassword;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException('Email already taken');
        }
      }
      throw error;
    }
  }

  async deleteUser(id: number): Promise<void> {
    try {
      await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  async deleteSelf(userId: number, dto: DeleteSelfDto): Promise<void> {
    const existingUser = await this.getUserById(userId);

    const pwMatches = await this.passwordService.verify(
      existingUser.passwordHash,
      dto.currentPassword,
    );
    if (!pwMatches) {
      throw new ForbiddenException('Current password is incorrect');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });
  }

  async updateUserAgentId(
    userId: number,
    agentId: string | null,
  ): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { agentId },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }
}
