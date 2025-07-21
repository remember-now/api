import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Role } from 'generated/prisma';

const roleValues = Object.values(Role) as [string, ...string[]];

const CreateUserSchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z
      .string()
      .max(254)
      .toLowerCase()
      .email('Please enter a valid email address'),
  ),
  password: z.string().min(5, 'Password must be at least 5 characters').max(60),
  role: z.enum(roleValues).optional().default(Role.USER),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
