import { Module } from '@nestjs/common';

import { CombinedExtractionService } from './combined-extraction.service';
import { EdgeExtractionService } from './edge-extraction.service';
import { NodeExtractionService } from './node-extraction.service';

@Module({
  providers: [NodeExtractionService, EdgeExtractionService, CombinedExtractionService],
  exports: [NodeExtractionService, EdgeExtractionService, CombinedExtractionService],
})
export class ExtractionModule {}
