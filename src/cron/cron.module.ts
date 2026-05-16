import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { AiReportModule } from '../ai-report/ai-report.module';
import { AutoIntelModule } from '../auto-intel/auto-intel.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { FootballDataModule } from '../football-data/football-data.module';
import { MatchLiveModule } from '../match-live/match-live.module';
import { PredictionModule } from '../prediction/prediction.module';
import { PublicSourcesModule } from '../public-sources/public-sources.module';
import { WeatherModule } from '../weather/weather.module';

@Module({
  imports: [
    FootballDataModule,
    ApiFootballModule,
    WeatherModule,
    PublicSourcesModule,
    AutoIntelModule,
    AiReportModule,
    PredictionModule,
    MatchLiveModule,
  ],
  providers: [CronService],
})
export class CronModule {}
