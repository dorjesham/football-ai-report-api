import { Module, forwardRef } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { DataPipelineModule } from '../data-pipeline/data-pipeline.module';
import { MatchIntelModule } from '../match-intel/match-intel.module';
import { PredictionModule } from '../prediction/prediction.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WeatherModule } from '../weather/weather.module';
import { WorldCupBootstrapService } from './world-cup-bootstrap.service';
import { WorldCupCoverageService } from './world-cup-coverage.service';
import { WorldCupCronService } from './world-cup-cron.service';
import { WorldCupExtendedSyncService } from './world-cup-extended-sync.service';

@Module({
  imports: [
    PrismaModule,
    ApiFootballModule,
    forwardRef(() => DataPipelineModule),
    PredictionModule,
    forwardRef(() => AiReportModule),
    WeatherModule,
    MatchIntelModule,
  ],
  providers: [
    WorldCupCoverageService,
    WorldCupBootstrapService,
    WorldCupCronService,
    WorldCupExtendedSyncService,
  ],
  exports: [
    WorldCupCoverageService,
    WorldCupBootstrapService,
    WorldCupCronService,
    WorldCupExtendedSyncService,
  ],
})
export class WorldCupModule {}
