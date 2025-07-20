export interface UserResponse {
  id: number;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
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
