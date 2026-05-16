import { Module } from '@nestjs/common';
import { GptImage2Client } from './gpt-image2.client';
import { SocialGuideService } from './social-guide.service';
import { SocialGuideController } from './social-guide.controller';
import { SocialPosterController } from './social-poster.controller';

@Module({
  controllers: [SocialGuideController, SocialPosterController],
  providers: [SocialGuideService, GptImage2Client],
  exports: [SocialGuideService],
})
export class SocialGuideModule {}
