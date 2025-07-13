import { User } from 'generated/prisma';

export interface PaginatedUsers {
  users: Omit<User, 'passwordHash'>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
