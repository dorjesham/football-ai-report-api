import { Module } from '@nestjs/common';
import { MatchAfRawBundleService } from './match-af-raw-bundle.service';
import { MatchLlmBundleInputService } from './match-llm-bundle-input.service';

@Module({
  providers: [MatchAfRawBundleService, MatchLlmBundleInputService],
  exports: [MatchAfRawBundleService, MatchLlmBundleInputService],
})
export class MatchAfRawBundleModule {}
