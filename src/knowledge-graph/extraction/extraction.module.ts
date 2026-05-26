import { Module } from '@nestjs/common';

import { EdgeExtractionService } from './edge-extraction.service';
import { NodeExtractionService } from './node-extraction.service';

@Module({
  providers: [NodeExtractionService, EdgeExtractionService],
  exports: [NodeExtractionService, EdgeExtractionService],
})
export class ExtractionModule {}
