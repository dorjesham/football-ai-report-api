import { Module } from '@nestjs/common';
import { MatchFactsCanonicalService } from './match-facts-canonical.service';
import { MatchFactsQualityService } from './match-facts-quality.service';

@Module({
  providers: [MatchFactsQualityService, MatchFactsCanonicalService],
  exports: [MatchFactsQualityService, MatchFactsCanonicalService],
})
export class MatchFactsModule {}
