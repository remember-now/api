import { Injectable } from '@nestjs/common';
import * as argon from 'argon2';

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon.hash(password);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon.verify(hash, password);
  }
}
