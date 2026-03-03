import { Module } from '@nestjs/common';

import { CryptoConfigModule } from '@/config/crypto';

import { CryptoService } from './crypto.service';

@Module({
  imports: [CryptoConfigModule],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
