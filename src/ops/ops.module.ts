import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { ApiFootballCostEstimatorService } from './api-football-cost-estimator.service';

@Module({
  imports: [ApiFootballModule],
  providers: [ApiFootballCostEstimatorService],
  exports: [ApiFootballCostEstimatorService],
})
export class OpsModule {}
