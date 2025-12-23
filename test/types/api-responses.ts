export type {
  UserWithoutPassword,
  User,
  CreateUser,
  UpdateUser,
  UpdateSelf,
} from '@/user/dto';

export type {
  Auth,
  LoginResponse,
  SignupResponse,
  LogoutResponse,
} from '@/auth/dto';

export type { PaginatedUsers, GetUsersQuery, GetUserParams } from '@/user/dto';

// Validation error response type (from nestjs-zod)
export interface ValidationErrorResponse {
  statusCode: number;
  message: string;
  errors: Array<{
    code: string;
    path: string[];
    message: string;
  }>;
}
