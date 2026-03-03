import { Module } from '@nestjs/common';

import { LlmConfigModule } from '@/config/llm';
import { CryptoModule } from '@/providers/crypto';

import { LlmFactoryService } from './factory/llm-factory.service';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';

@Module({
  imports: [LlmConfigModule, CryptoModule],
  controllers: [LlmController],
  providers: [LlmService, LlmFactoryService],
  exports: [LlmService],
})
export class LlmModule {}
