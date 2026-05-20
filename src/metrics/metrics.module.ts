import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { DetailV2MetricsInterceptor } from './detail-v2-metrics.interceptor';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, DetailV2MetricsInterceptor],
  exports: [MetricsService, DetailV2MetricsInterceptor],
})
export class MetricsModule {}
