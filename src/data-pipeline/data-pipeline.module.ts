import { Module } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { MatchCacheInvalidationModule } from '../matches/match-cache-invalidation.module';
import { MatchLiveModule } from '../match-live/match-live.module';
import { PredictionModule } from '../prediction/prediction.module';
import { FinishedPostMatchBootstrapService } from './finished-post-match-bootstrap.service';
import { ScheduledPreMatchBootstrapService } from './scheduled-pre-match-bootstrap.service';
import { IngestOrchestratorService } from './ingest-orchestrator.service';
import { IngestJobTrackerService } from './ingest-job-tracker.service';
import { StandingsMaterializeService } from './standings-materialize.service';
import { TopscorersMaterializeService } from './topscorers-materialize.service';
import { MatchStatusReconcileService } from './match-status-reconcile.service';
import { InjuriesMaterializeService } from './injuries-materialize.service';
import { LiveStandingsTickService } from './live-standings-tick.service';
import { forwardRef } from '@nestjs/common';
import { WorldCupModule } from '../world-cup/world-cup.module';

@Module({
  imports: [
    ApiFootballModule,
    PredictionModule,
    forwardRef(() => AiReportModule),
    MatchCacheInvalidationModule,
    MatchLiveModule,
    forwardRef(() => WorldCupModule),
  ],
  providers: [
    IngestJobTrackerService,
    StandingsMaterializeService,
    TopscorersMaterializeService,
    InjuriesMaterializeService,
    MatchStatusReconcileService,
    FinishedPostMatchBootstrapService,
    ScheduledPreMatchBootstrapService,
    IngestOrchestratorService,
    LiveStandingsTickService,
  ],
  exports: [
    IngestOrchestratorService,
    IngestJobTrackerService,
    MatchStatusReconcileService,
    StandingsMaterializeService,
    TopscorersMaterializeService,
    InjuriesMaterializeService,
    FinishedPostMatchBootstrapService,
    ScheduledPreMatchBootstrapService,
    LiveStandingsTickService,
  ],
})
export class DataPipelineModule {}
