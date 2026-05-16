import { Module } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { FantasyModule } from '../fantasy/fantasy.module';
import { FootballDataModule } from '../football-data/football-data.module';
import { HeadToHeadModule } from '../head-to-head/head-to-head.module';
import { PlayerIntelligenceModule } from '../player-intelligence/player-intelligence.module';
import { PredictionModule } from '../prediction/prediction.module';
import { PublicSourcesModule } from '../public-sources/public-sources.module';
import { SocialGuideModule } from '../social-guide/social-guide.module';
import { TacticsModule } from '../tactics/tactics.module';
import { WeatherModule } from '../weather/weather.module';
import { MatchIntelPipelineService } from './match-intel-pipeline.service';

@Module({
  imports: [
    ApiFootballModule,
    FootballDataModule,
    PublicSourcesModule,
    WeatherModule,
    PredictionModule,
    PlayerIntelligenceModule,
    TacticsModule,
    FantasyModule,
    HeadToHeadModule,
    SocialGuideModule,
    AiReportModule,
  ],
  providers: [MatchIntelPipelineService],
  exports: [MatchIntelPipelineService],
})
export class MatchIntelPipelineModule {}
