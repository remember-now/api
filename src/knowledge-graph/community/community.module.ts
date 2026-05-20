import { Module } from '@nestjs/common';

import { CommunityService } from './community.service';

@Module({
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
