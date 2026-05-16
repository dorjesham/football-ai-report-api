import { Module } from '@nestjs/common';
import { PowerRatingModule } from '../power-rating/power-rating.module';
import { PredictionGradingService } from './prediction-grading.service';
import { PredictionService } from './prediction.service';
import { PredictionController } from './prediction.controller';

@Module({
  imports: [PowerRatingModule],
  controllers: [PredictionController],
  providers: [PredictionService, PredictionGradingService],
  exports: [PredictionService, PredictionGradingService],
})
export class PredictionModule {}
