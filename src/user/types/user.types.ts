import { User } from 'generated/prisma';

export type UserWithoutPassword = Omit<User, 'passwordHash'>;

export interface PaginatedUsers {
  users: UserWithoutPassword[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
