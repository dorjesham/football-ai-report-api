import { Module } from '@nestjs/common';
import { UnlockModule } from '../unlock/unlock.module';
import { PaywallService } from './paywall.service';

@Module({
  imports: [UnlockModule],
  providers: [PaywallService],
  exports: [PaywallService],
})
export class PaywallModule {}
