export type {
  UserWithoutPassword,
  User,
  CreateUser,
  UpdateUser,
  UpdateSelf,
} from 'src/user/dto';

export type {
  Auth,
  LoginResponse,
  SignupResponse,
  LogoutResponse,
} from 'src/auth/dto';

export type {
  PaginatedUsers,
  GetUsersQuery,
  GetUserParams,
} from 'src/user/dto';

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
