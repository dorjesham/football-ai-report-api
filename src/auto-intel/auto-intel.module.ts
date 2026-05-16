import { Module } from '@nestjs/common';
import { MatchIntelPipelineModule } from '../match-intel-pipeline/match-intel-pipeline.module';
import { PredictionModule } from '../prediction/prediction.module';
import { AutoIntelBatchService } from './auto-intel-batch.service';

@Module({
  imports: [PredictionModule, MatchIntelPipelineModule],
  providers: [AutoIntelBatchService],
  exports: [AutoIntelBatchService],
})
export class AutoIntelModule {}
