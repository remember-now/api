import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Role as PrismaRole } from 'generated/prisma/client';
import { PasswordSchema } from 'src/common/schemas';

// Schemas
export const RoleSchema = z.enum(PrismaRole).meta({ id: 'Role' });

export const CreateUserSchema = z
  .object({
    email: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
      z
        .email('Please enter a valid email address')
        .max(254, 'Email cannot be longer than 254 characters'),
    ),
    password: PasswordSchema,
    role: RoleSchema.optional().default(RoleSchema.enum.USER),
  })
  .meta({ id: 'CreateUser' });

export const UserSchema = CreateUserSchema.omit({ password: true })
  .extend({
    id: z.coerce.number().int().positive(),
    passwordHash: z.string(),
    agentId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'User' });

export const UserWithoutPasswordSchema = UserSchema.omit({
  passwordHash: true,
});

// DTO classes
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
export class UserDto extends createZodDto(UserSchema) {}
export class UserWithoutPasswordDto extends createZodDto(
  UserWithoutPasswordSchema,
) {}

// Types
export type Role = z.infer<typeof RoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UserWithoutPassword = z.infer<typeof UserWithoutPasswordSchema>;
