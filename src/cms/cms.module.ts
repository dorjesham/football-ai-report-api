import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';

@Module({
  imports: [OrdersModule],
  controllers: [CmsController],
  providers: [CmsService],
})
export class CmsModule {}
