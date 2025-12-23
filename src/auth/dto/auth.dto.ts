import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserWithoutPasswordSchema } from '@/user/dto';
import { PasswordSchema } from '@/common/schemas/password.schema';

// Schemas

export const AuthSchema = z
  .object({
    email: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
      z
        .email('Please enter a valid email address')
        .max(254, 'Email cannot be longer than 254 characters'),
    ),
    password: PasswordSchema,
  })
  .meta({ id: 'Auth' });

export const LoginResponseSchema = z
  .object({
    message: z.string(),
    user: UserWithoutPasswordSchema,
  })
  .meta({ id: 'LoginResponse' });

export const SignupResponseSchema = LoginResponseSchema.meta({
  id: 'SignupResponse',
});

export const LogoutResponseSchema = z
  .object({
    message: z.string(),
  })
  .meta({ id: 'LogoutResponse' });

// DTO classes
export class AuthDto extends createZodDto(AuthSchema) {}
export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}
export class SignupResponseDto extends createZodDto(SignupResponseSchema) {}
export class LogoutResponseDto extends createZodDto(LogoutResponseSchema) {}

// Types
export type Auth = z.infer<typeof AuthSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type SignupResponse = z.infer<typeof SignupResponseSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
