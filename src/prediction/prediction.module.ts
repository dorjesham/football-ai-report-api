import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { DeepseekModule } from '../deepseek/deepseek.module';
import { MatchIntelModule } from '../match-intel/match-intel.module';
import { PowerRatingModule } from '../power-rating/power-rating.module';
import { PredictionGradingService } from './prediction-grading.service';
import { PredictionService } from './prediction.service';
import { PredictionController } from './prediction.controller';

@Module({
  imports: [PowerRatingModule, ApiFootballModule, DeepseekModule, MatchIntelModule],
  controllers: [PredictionController],
  providers: [PredictionService, PredictionGradingService],
  exports: [PredictionService, PredictionGradingService],
})
export class PredictionModule {}
