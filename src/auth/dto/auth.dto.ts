import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AuthSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),

  password: z.string().min(5, 'Password must be at least 5 characters'),
});

export class AuthDto extends createZodDto(AuthSchema) {}
