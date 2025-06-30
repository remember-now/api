import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { User, Role } from 'generated/prisma';

@Injectable()
export class AuthSerializer extends PassportSerializer {
  constructor(private readonly authService: AuthService) {
    super();
  }

  serializeUser(
    user: User,
    done: (err: Error | null, user: { id: number; role: Role }) => void,
  ) {
    done(null, { id: user.id, role: user.role });
  }

  async deserializeUser(
    payload: { id: number; role: Role },
    done: (err: Error | null, user: Omit<User, 'passwordHash'> | null) => void,
  ) {
    try {
      const user = await this.authService.getUserById(payload.id);
      const { passwordHash: _, ...userWithoutPassword } = user;
      done(null, userWithoutPassword);
    } catch (error) {
      done(error as Error, null);
    }
  }
}
