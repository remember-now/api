import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthDto } from './dto';
import { UserService } from 'src/user/user.service';
import * as argon from 'argon2';
import { Session } from 'express-session';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private userService: UserService) {}

  async registerUser(dto: AuthDto) {
    const hash = await argon.hash(dto.password);

    const user = await this.userService.createUser(dto.email, hash);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async validateUser(dto: AuthDto) {
    try {
      const user = await this.userService.getUserByEmail(dto.email);
      const pwMatches = await argon.verify(user.passwordHash, dto.password);
      if (!pwMatches) throw new ForbiddenException('Invalid credentials');

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException('Invalid credentials');
      }
      throw error;
    }
  }

  async destroyUserSession(session: Session): Promise<void> {
    return new Promise((resolve) => {
      session.destroy((err) => {
        if (err) {
          this.logger.error('Failed to destroy user session', err);
        }
        resolve();
      });
    });
  }
}
