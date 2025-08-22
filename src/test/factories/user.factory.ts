import { Role, User } from 'generated/prisma';
import { UserWithoutPassword } from 'src/user/types';

export interface UserFactoryOptions {
  id?: number;
  email?: string;
  role?: Role;
  agentId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  passwordHash?: string;
}

export class UserFactory {
  private static defaultUser: User = {
    id: 1,
    email: 'test@example.com',
    role: Role.USER,
    agentId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  };

  /**
   * Creates a full User object (including passwordHash)
   */
  static createUser(options: UserFactoryOptions = {}): User {
    return {
      ...this.defaultUser,
      ...options,
    };
  }

  /**
   * Creates a UserWithoutPassword object (excludes passwordHash)
   */
  static createUserWithoutPassword(
    options: UserFactoryOptions = {},
  ): UserWithoutPassword {
    const user = this.createUser(options);
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Creates a user service return type (what createUser method returns)
   * This has agentId: null specifically (not string | null)
   */
  static createUserServiceResult(
    options: Omit<UserFactoryOptions, 'passwordHash'> = {},
  ) {
    const { passwordHash: _, ...userOptions } = this.defaultUser;
    const result = {
      ...userOptions,
      ...options,
    };
    return {
      ...result,
      agentId: null,
    };
  }

  /**
   * Creates an auth service return type (what registerUser/validateUser returns)
   * This excludes both passwordHash and agentId
   */
  static createAuthServiceResult(
    options: Omit<UserFactoryOptions, 'passwordHash' | 'agentId'> = {},
  ) {
    const { passwordHash: _, agentId: __, ...userOptions } = this.defaultUser;
    return {
      ...userOptions,
      ...options,
    };
  }
}
