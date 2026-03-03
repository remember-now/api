import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CryptoConfigService {
  constructor(private readonly configService: ConfigService) {}

  get encryptionKey(): Buffer {
    return this.configService.get<Buffer>('crypto.encryptionKey')!;
  }
}
