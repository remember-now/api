import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { UserSchema, UserWithoutPasswordSchema } from './create-user.dto';

// Schemas
export const GetUserParamsSchema = z.object({
  id: UserSchema.shape.id,
});

export const GetUsersQuerySchema = z.object({
  page: z.coerce.number().int().gte(1).default(1),
  limit: z.coerce.number().int().gte(1).lte(100).default(10),
  search: z.string().min(1).optional(),
});

export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export const PaginatedUsersSchema = z
  .object({
    users: z.array(UserWithoutPasswordSchema),
    pagination: PaginationSchema,
  })
  .meta({ id: 'PaginatedUsers' });

// DTO classes
export class GetUserParamsDto extends createZodDto(GetUserParamsSchema) {}
export class GetUsersQueryDto extends createZodDto(GetUsersQuerySchema) {}
export class PaginatedUsersDto extends createZodDto(PaginatedUsersSchema) {}

// Types
export type GetUserParams = z.infer<typeof GetUserParamsSchema>;
export type GetUsersQuery = z.infer<typeof GetUsersQuerySchema>;
export type PaginatedUsers = z.infer<typeof PaginatedUsersSchema>;
