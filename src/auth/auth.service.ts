import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthDto } from './dto';
import { UserService } from 'src/user/user.service';
import * as argon from 'argon2';

@Injectable()
export class AuthService {
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
}
