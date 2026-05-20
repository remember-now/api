import { Module } from '@nestjs/common';

import { RepositoryModule } from '../repository/repository.module';
import { EdgeResolutionService } from './edge-resolution.service';
import { NodeResolutionService } from './node-resolution.service';

@Module({
  imports: [RepositoryModule],
  providers: [NodeResolutionService, EdgeResolutionService],
  exports: [NodeResolutionService, EdgeResolutionService],
})
export class ResolutionModule {}
