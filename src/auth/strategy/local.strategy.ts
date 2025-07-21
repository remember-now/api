import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { AuthSchema } from '../dto';
import { ZodError } from 'zod';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly authService: AuthService) {
    // In our auth DTOs we're using the email field
    // and not username, which is passport's default.
    super({
      usernameField: 'email',
    });
  }

  async validate(email: string, password: string) {
    try {
      const parsed = AuthSchema.parse({ email, password });
      return this.authService.validateUser(parsed);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return false;
      }
      throw error;
    }
  }
}
