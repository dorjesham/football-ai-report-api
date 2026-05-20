import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { DataPipelineModule } from '../data-pipeline/data-pipeline.module';
import { MatchLiveModule } from '../match-live/match-live.module';
import { AiReportModule } from '../ai-report/ai-report.module';
import { MatchAfRawBundleModule } from '../match-af-raw-bundle/match-af-raw-bundle.module';
import { MatchDetailBffModule } from '../match-detail-bff/match-detail-bff.module';
import { HealthModule } from '../health/health.module';
import { RedisModule } from '../redis/redis.module';
import { AdminApiController } from './admin-api.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminLiveCoverageService } from './admin-live-coverage.service';
import { AdminAfCoverageService } from './admin-af-coverage.service';
import { AdminAfCatalogOpsService } from './admin-af-catalog-ops.service';
import { AdminMatchOpsService } from './admin-match-ops.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersService } from './admin-users.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminMatchPreviewService } from './admin-match-preview.service';
import { AdminSystemStatusService } from './admin-system-status.service';
import { AdminMatchesListService } from './admin-matches-list.service';
import { AdminMatchRebuildService } from './admin-match-rebuild.service';
import { AdminAiOpsService } from './admin-ai-ops.service';
import { AdminConsoleRoleGuard } from '../common/guards/admin-console-role.guard';

@Module({
  imports: [
    AdminModule,
    ApiFootballModule,
    DataPipelineModule,
    MatchLiveModule,
    AiReportModule,
    MatchAfRawBundleModule,
    MatchDetailBffModule,
    HealthModule,
    RedisModule,
  ],
  controllers: [AdminApiController],
  providers: [
    AdminDashboardService,
    AdminLiveCoverageService,
    AdminAfCoverageService,
    AdminAfCatalogOpsService,
    AdminMatchOpsService,
    AdminOpsService,
    AdminStatsService,
    AdminUsersService,
    AdminAuditService,
    AdminMatchPreviewService,
    AdminSystemStatusService,
    AdminMatchesListService,
    AdminMatchRebuildService,
    AdminAiOpsService,
    AdminConsoleRoleGuard,
  ],
  exports: [AdminAuditService],
})
export class AdminApiModule {}
