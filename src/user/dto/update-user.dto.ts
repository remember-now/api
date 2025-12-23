import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { PasswordSchema } from '@/common/schemas';

import { CreateUserSchema, RoleSchema } from './create-user.dto';

// Schemas
export const UpdateUserSchema = z
  .object({
    email: CreateUserSchema.shape.email.optional(),
    password: PasswordSchema.optional(),
    role: RoleSchema.optional(),
  })
  .refine(
    (data) =>
      data.email !== undefined ||
      data.password !== undefined ||
      data.role !== undefined,
    {
      message: 'At least one field (email, password, or role) must be provided',
    },
  )
  .meta({ id: 'UpdateUser' });

export const UpdateSelfSchema = z
  .object({
    email: CreateUserSchema.shape.email.optional(),
    password: PasswordSchema.optional(),
    currentPassword: z.preprocess((val) => {
      if (typeof val !== 'string') return val;
      return val.trim();
    }, z.string().min(1, 'Current password is required').max(60)),
  })
  .refine((data) => data.email !== undefined || data.password !== undefined, {
    message: 'At least one field (email or password) must be provided',
  })
  .meta({ id: 'UpdateSelf' });

// DTO classes
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class UpdateSelfDto extends createZodDto(UpdateSelfSchema) {}

// Types
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type UpdateSelf = z.infer<typeof UpdateSelfSchema>;
