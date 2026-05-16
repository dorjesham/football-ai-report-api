import { Module } from '@nestjs/common';
import { AdminViewController } from './admin-view.controller';
import { AdminViewAuthService } from './admin-view-auth.service';
import { AdminViewActionService } from './admin-view-action.service';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { AiReportModule } from '../ai-report/ai-report.module';
import { FantasyModule } from '../fantasy/fantasy.module';
import { FootballDataModule } from '../football-data/football-data.module';
import { HeadToHeadModule } from '../head-to-head/head-to-head.module';
import { MatchIntelPipelineModule } from '../match-intel-pipeline/match-intel-pipeline.module';
import { MatchesModule } from '../matches/matches.module';
import { PlayerIntelligenceModule } from '../player-intelligence/player-intelligence.module';
import { PredictionModule } from '../prediction/prediction.module';
import { PublicSourcesModule } from '../public-sources/public-sources.module';
import { SocialGuideModule } from '../social-guide/social-guide.module';
import { TacticsModule } from '../tactics/tactics.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { WeatherModule } from '../weather/weather.module';
import { CompetitionsModule } from '../competitions/competitions.module';
import { DataIngestModule } from '../data-ingest/data-ingest.module';
import { AutoIntelModule } from '../auto-intel/auto-intel.module';
import { ApiFootballModule } from '../api-football/api-football.module';

@Module({
  imports: [
    AuthModule,
    AdminModule,
    AutoIntelModule,
    ApiFootballModule,
    CompetitionsModule,
    DataIngestModule,
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
    MatchesModule,
    TournamentsModule,
    MatchIntelPipelineModule,
  ],
  controllers: [AdminViewController],
  providers: [AdminViewAuthService, AdminViewActionService],
})
export class AdminViewModule {}
