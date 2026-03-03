import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CryptoConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [ConfigModule.forFeature(configuration)],
  providers: [CryptoConfigService],
  exports: [CryptoConfigService],
})
export class CryptoConfigModule {}
