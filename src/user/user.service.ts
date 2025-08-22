import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
import { AgentJobData } from 'src/agent/types';
import { QueueNames } from 'src/common/constants';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectQueue(QueueNames.AGENT_PROVISIONING)
    private readonly agentQueue: Queue<AgentJobData>,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
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
      await this.enqueueAgentCreation(user.id);

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        agentId: null,
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
        agentId: true,
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
          agentId: true,
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
          agentId: true,
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
      const user = await this.getUserById(id);

      await this.prisma.user.delete({
        where: { id },
      });
      if (user.agentId) {
        await this.enqueueAgentDeletion(id, user.agentId);
      }
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
    if (existingUser.agentId) {
      await this.enqueueAgentDeletion(userId, existingUser.agentId);
    }
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

  private async enqueueAgentCreation(userId: number): Promise<void> {
    try {
      await this.agentQueue.add(
        'create-agent',
        { userId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );
      this.logger.log(`Enqueued agent creation for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue agent creation for user ${userId}:`,
        error,
      );
    }
  }

  private async enqueueAgentDeletion(
    userId: number,
    agentId: string,
  ): Promise<void> {
    try {
      await this.agentQueue.add(
        'delete-agent',
        { userId, agentId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );
      this.logger.log(`Enqueued agent deletion for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue agent deletion for user ${userId}:`,
        error,
      );
    }
  }
}
