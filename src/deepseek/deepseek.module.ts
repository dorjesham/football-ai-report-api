import { Module } from '@nestjs/common';
import { DeepseekConcurrencyService } from './deepseek-concurrency.service';
import { DeepseekService } from './deepseek.service';

@Module({
  providers: [DeepseekConcurrencyService, DeepseekService],
  exports: [DeepseekService, DeepseekConcurrencyService],
})
export class DeepseekModule {}
