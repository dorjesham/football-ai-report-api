import { Module } from '@nestjs/common';
import { ApiFootballCostEstimatorService } from './api-football-cost-estimator.service';

@Module({
  providers: [ApiFootballCostEstimatorService],
  exports: [ApiFootballCostEstimatorService],
})
export class OpsModule {}
