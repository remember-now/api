import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Role } from 'generated/prisma';

const roleValues = Object.values(Role) as [string, ...string[]];

const UpdateUserSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim()
    .optional(),
  password: z
    .string()
    .min(5, 'Password must be at least 5 characters')
    .optional(),
  role: z.enum(roleValues).optional(),
});

const UpdateSelfSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim()
    .optional(),
  password: z
    .string()
    .min(5, 'Password must be at least 5 characters')
    .optional(),
  currentPassword: z.string().min(1, 'Current password is required'),
});

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class UpdateSelfDto extends createZodDto(UpdateSelfSchema) {}
