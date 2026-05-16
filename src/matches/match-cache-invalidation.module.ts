import { Module } from '@nestjs/common';
import { MatchCacheInvalidationService } from './match-cache-invalidation.service';

@Module({
  providers: [MatchCacheInvalidationService],
  exports: [MatchCacheInvalidationService],
})
export class MatchCacheInvalidationModule {}
