import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, Role } from 'generated/prisma';
import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
import { PrismaService } from 'src/prisma/prisma.service';
import { PasswordService } from 'src/auth/password.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateSelfDto,
  GetUsersQueryDto,
  DeleteSelfDto,
} from './dto';
import { PaginatedUsers, UserWithoutPassword } from './types';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private passwordService: PasswordService,
  ) {}

  async createUser(
    email: string,
    passwordHash: string,
    role: Role = Role.USER,
  ) {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: email,
          passwordHash: passwordHash,
          role: role,
        },
      });
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException('Credentials taken');
        }
      }
      throw error;
    }
  }

  async createUserWithDto(dto: CreateUserDto) {
    const hash = await this.passwordService.hash(dto.password);
    return this.createUser(dto.email, hash, dto.role as Role);
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
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const totalPages = Math.ceil(total / limit);

    return {
      users,
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
    return user;
  }

  async getUserByEmail(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
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
    if (dto.role && Object.values(Role).includes(dto.role as Role)) {
      updateData.role = dto.role as Role;
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return updatedUser;
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
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return updatedUser;
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
}
