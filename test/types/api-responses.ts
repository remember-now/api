export interface UserResponse {
  id: number;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithPasswordResponse {
  id: number;
  email: string;
  role: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  message: string;
  user: UserResponse;
}

export interface ValidationErrorResponse {
  statusCode: number;
  message: string;
  errors: Array<{
    code: string;
    path: string[];
    message: string;
  }>;
}

export interface MessageResponse {
  message: string;
}

export interface PaginatedUsersResponse {
  users: UserResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
