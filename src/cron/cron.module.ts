import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { AiReportModule } from '../ai-report/ai-report.module';
import { AutoIntelModule } from '../auto-intel/auto-intel.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { MatchLiveModule } from '../match-live/match-live.module';
import { DataPipelineModule } from '../data-pipeline/data-pipeline.module';
import { PredictionModule } from '../prediction/prediction.module';
import { PublicSourcesModule } from '../public-sources/public-sources.module';
import { WeatherModule } from '../weather/weather.module';
import { WorldCupModule } from '../world-cup/world-cup.module';

@Module({
  imports: [
    ApiFootballModule,
    LeaguesModule,
    WeatherModule,
    PublicSourcesModule,
    AutoIntelModule,
    AiReportModule,
    PredictionModule,
    MatchLiveModule,
    DataPipelineModule,
    WorldCupModule,
  ],
  providers: [CronService],
})
export class CronModule {}
