import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AiReportModule } from '../ai-report/ai-report.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { AutoIntelModule } from '../auto-intel/auto-intel.module';
import { MatchIntelPipelineModule } from '../match-intel-pipeline/match-intel-pipeline.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [
    StatsModule,
    TournamentsModule,
    MatchIntelPipelineModule,
    AiReportModule,
    AutoIntelModule,
    ApiFootballModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService, StatsModule],
})
export class AdminModule {}
