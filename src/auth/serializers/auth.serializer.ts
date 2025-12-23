import { Injectable, NotFoundException } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { Role, User } from '@generated/prisma/client';

import { UserWithoutPassword } from '@/user/dto';
import { UserService } from '@/user/user.service';

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
    done: (err: Error | null, user: UserWithoutPassword | null) => void,
  ) {
    try {
      const user = await this.userService.getUserById(payload.id);
      const { passwordHash: _, ...userWithoutPassword } = user;
      done(null, userWithoutPassword);
    } catch (error) {
      if (error instanceof NotFoundException) {
        done(null, null);
      } else {
        done(error as Error, null);
      }
    }
  }
}
