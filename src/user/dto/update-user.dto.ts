import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Role } from 'generated/prisma';

const roleValues = Object.values(Role) as [string, ...string[]];

const UpdateUserSchema = z.object({
  email: z
    .preprocess((val) => {
      if (typeof val !== 'string') return val;
      return val.trim().toLowerCase();
    }, z.string().toLowerCase().email('Please enter a valid email address'))
    .optional(),
  password: z
    .string()
    .min(5, 'Password must be at least 5 characters')
    .optional(),
  role: z.enum(roleValues).optional(),
});

const UpdateSelfSchema = z.object({
  email: z
    .preprocess((val) => {
      if (typeof val !== 'string') return val;
      return val.trim().toLowerCase();
    }, z.string().toLowerCase().email('Please enter a valid email address'))
    .optional(),
  password: z
    .string()
    .min(5, 'Password must be at least 5 characters')
    .optional(),
  currentPassword: z.preprocess(
    (val) => {
      if (typeof val !== 'string') return val;
      return val.trim();
    },
    z.string().min(1, 'Current password is required'),
  ),
});

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class UpdateSelfDto extends createZodDto(UpdateSelfSchema) {}
