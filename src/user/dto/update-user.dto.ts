import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Role } from 'generated/prisma';

const roleValues = Object.values(Role) as [string, ...string[]];

const UpdateUserSchema = z
  .object({
    email: z
      .preprocess((val) => {
        if (typeof val !== 'string') return val;
        return val.trim().toLowerCase();
      }, z.string().max(254).toLowerCase().email('Please enter a valid email address'))
      .optional(),
    password: z
      .string()
      .min(5, 'Password must be at least 5 characters')
      .max(60)
      .optional(),
    role: z.enum(roleValues).optional(),
  })
  .refine(
    (data) =>
      data.email !== undefined ||
      data.password !== undefined ||
      data.role !== undefined,
    {
      message: 'At least one field (email, password, or role) must be provided',
    },
  );

const UpdateSelfSchema = z
  .object({
    email: z
      .preprocess((val) => {
        if (typeof val !== 'string') return val;
        return val.trim().toLowerCase();
      }, z.string().max(254).toLowerCase().email('Please enter a valid email address'))
      .optional(),
    password: z
      .string()
      .min(5, 'Password must be at least 5 characters')
      .max(60)
      .optional(),
    currentPassword: z.preprocess((val) => {
      if (typeof val !== 'string') return val;
      return val.trim();
    }, z.string().min(1, 'Current password is required').max(60)),
  })
  .refine((data) => data.email !== undefined || data.password !== undefined, {
    message: 'At least one field (email or password) must be provided',
  });

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class UpdateSelfDto extends createZodDto(UpdateSelfSchema) {}
