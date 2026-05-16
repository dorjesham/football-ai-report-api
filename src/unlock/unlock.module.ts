import { Module } from '@nestjs/common';
import { UnlockService } from './unlock.service';

@Module({
  providers: [UnlockService],
  exports: [UnlockService],
})
export class UnlockModule {}
