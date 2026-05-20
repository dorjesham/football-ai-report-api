import { Module } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { DataPipelineModule } from '../data-pipeline/data-pipeline.module';
import { MatchIntelModule } from '../match-intel/match-intel.module';
import { PredictionModule } from '../prediction/prediction.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WeatherModule } from '../weather/weather.module';
import { WorldCupModule } from '../world-cup/world-cup.module';
import { WorldCupAdminController } from './world-cup-admin.controller';
import { WorldCupAdminService } from './world-cup-admin.service';

@Module({
  imports: [
    PrismaModule,
    WorldCupModule,
    ApiFootballModule,
    DataPipelineModule,
    PredictionModule,
    AiReportModule,
    WeatherModule,
    MatchIntelModule,
  ],
  controllers: [WorldCupAdminController],
  providers: [WorldCupAdminService],
  exports: [WorldCupAdminService],
})
export class WorldCupAdminModule {}
