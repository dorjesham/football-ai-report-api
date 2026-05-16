import { Module } from '@nestjs/common';
import { MatchCacheInvalidationModule } from '../matches/match-cache-invalidation.module';
import { WxpayController } from './wxpay.controller';
import { WxpayService } from './wxpay.service';
import { WechatPayV3Service } from './wechat-pay-v3.service';

@Module({
  imports: [MatchCacheInvalidationModule],
  controllers: [WxpayController],
  providers: [WxpayService, WechatPayV3Service],
  exports: [WxpayService, WechatPayV3Service],
})
export class WxPayModule {}
