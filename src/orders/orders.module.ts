import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { UnlockModule } from '../unlock/unlock.module';
import { WxPayModule } from '../wxpay/wxpay.module';

@Module({
  imports: [UnlockModule, WxPayModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
