import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeedbackController } from './feedback.controller';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController],
})
export class FeedbackModule {}
