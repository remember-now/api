import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AuthSchema = z.object({
  email: z.preprocess((val) => {
    if (typeof val !== 'string') return val;
    return val.trim().toLowerCase();
  }, z.string().toLowerCase().email('Please enter a valid email address')),
  password: z.preprocess(
    (val) => {
      if (typeof val !== 'string') return val;
      return val.trim();
    },
    z.string().min(5, 'Password must be at least 5 characters'),
  ),
});

export class AuthDto extends createZodDto(AuthSchema) {}
