import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { User, Role } from 'generated/prisma';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthSerializer extends PassportSerializer {
  constructor(private readonly userService: UserService) {
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
      const user = await this.userService.getUserById(payload.id);
      const { passwordHash: _, ...userWithoutPassword } = user;
      done(null, userWithoutPassword);
    } catch (error) {
      done(error as Error, null);
    }
  }
}
