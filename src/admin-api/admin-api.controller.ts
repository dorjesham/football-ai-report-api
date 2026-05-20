import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminConsoleRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { RequestUser } from '../common/types/request-user.type';
import { RequireAdminConsoleRole } from '../common/decorators/admin-console-role.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminConsoleRoleGuard } from '../common/guards/admin-console-role.guard';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';
import { RedisService } from '../redis/redis.service';
import { IngestOrchestratorService } from '../data-pipeline/ingest-orchestrator.service';
import { MatchStatusReconcileService } from '../data-pipeline/match-status-reconcile.service';
import { AdminService } from '../admin/admin.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminApiNoStoreInterceptor } from './admin-api-no-store.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { FinishedPostMatchBootstrapService } from '../data-pipeline/finished-post-match-bootstrap.service';
import { ScheduledPreMatchBootstrapService } from '../data-pipeline/scheduled-pre-match-bootstrap.service';
import { AiReportType } from '@prisma/client';
import { AiReportPublishService } from '../ai-report/ai-report-publish.service';
import { AiReportService } from '../ai-report/ai-report.service';
import { PostMatchReportService } from '../ai-report/post-match-report.service';
import { throwLegacyPipelineRetired } from '../common/errors/legacy-pipeline-retired.error';
import { MatchLiveFactsIngestService } from '../match-live/match-live-facts-ingest.service';
import { LiveStandingsTickService } from '../data-pipeline/live-standings-tick.service';
import { AdminLiveCoverageService } from './admin-live-coverage.service';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { AfCatalogSyncService } from '../api-football/af-catalog-sync.service';
import { MatchAfRawBundleService } from '../match-af-raw-bundle/match-af-raw-bundle.service';
import { AdminAfCoverageService } from './admin-af-coverage.service';
import { AdminAfCatalogOpsService } from './admin-af-catalog-ops.service';
import { AdminMatchOpsService } from './admin-match-ops.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminUsersService } from './admin-users.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminMatchPreviewService } from './admin-match-preview.service';
import { AdminMatchesListService } from './admin-matches-list.service';
import { AdminMatchRebuildService } from './admin-match-rebuild.service';
import { AdminAiOpsService } from './admin-ai-ops.service';

@ApiTags('admin-api')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard, AdminConsoleRoleGuard)
@UseInterceptors(AdminApiNoStoreInterceptor)
@Controller('admin/api')
export class AdminApiController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly orchestrator: IngestOrchestratorService,
    private readonly reconcile: MatchStatusReconcileService,
    private readonly admin: AdminService,
    private readonly prisma: PrismaService,
    private readonly finishedBootstrap: FinishedPostMatchBootstrapService,
    private readonly scheduledBootstrap: ScheduledPreMatchBootstrapService,
    private readonly aiPublish: AiReportPublishService,
    private readonly aiReport: AiReportService,
    private readonly postMatchReport: PostMatchReportService,
    private readonly liveFactsIngest: MatchLiveFactsIngestService,
    private readonly liveStandingsTick: LiveStandingsTickService,
    private readonly liveCoverageSvc: AdminLiveCoverageService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly afBundle: MatchAfRawBundleService,
    private readonly afCoverage: AdminAfCoverageService,
    private readonly afCatalog: AfCatalogSyncService,
    private readonly afCatalogOps: AdminAfCatalogOpsService,
    private readonly matchOps: AdminMatchOpsService,
    private readonly ops: AdminOpsService,
    private readonly adminUsers: AdminUsersService,
    private readonly adminStats: AdminStatsService,
    private readonly audit: AdminAuditService,
    private readonly matchPreview: AdminMatchPreviewService,
    private readonly matchesList: AdminMatchesListService,
    private readonly matchRebuild: AdminMatchRebuildService,
    private readonly aiOps: AdminAiOpsService,
    private readonly afQuotaSvc: ApiFootballQuotaService,
    private readonly redis: RedisService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '运维总览（配额、真实进行中、任务）' })
  overview() {
    return this.dashboard.overview();
  }

  @Get('ops/todos')
  todos() {
    return this.ops.getTodos();
  }

  @Get('ops/bootstrap-status')
  bootstrapStatus() {
    return this.ops.getBootstrapStatus();
  }

  @Get('ops/daily-summary')
  dailySummary(@Query('tab') tab?: string) {
    return this.ops.getDailySummary(tab ?? 'morning');
  }

  @Get('ops/match-health-summary')
  matchHealthSummary() {
    return this.ops.getMatchHealthSummary();
  }

  @Get('users')
  listUsers(
    @Query('take') take?: string,
    @Query('search') search?: string,
  ) {
    return this.adminUsers.listUsers({
      take: take ? Number(take) : undefined,
      search,
    });
  }

  @Get('users/:id/summary')
  @RequireAdminConsoleRole(AdminConsoleRole.FINANCE_ADMIN)
  async userSummary(
    @Param('id') id: string,
    @Query('revealPii') revealPii?: string,
  ) {
    const reveal = revealPii === 'true';
    const summary = await this.adminUsers.getUserSummary(id, reveal);
    if (reveal) {
      await this.audit.log({
        action: 'view_pii',
        targetType: 'User',
        targetId: id,
      });
    }
    return summary;
  }

  @Get('users/:id/assets')
  @RequireAdminConsoleRole(AdminConsoleRole.FINANCE_ADMIN)
  userAssets(@Param('id') id: string) {
    return this.adminUsers.listGeneratedAssets(id);
  }

  @Get('orders')
  listOrdersApi(
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    return this.adminUsers.listOrders({
      take: take ? Number(take) : undefined,
      status,
    });
  }

  @Get('stats/users')
  statsUsers(@Query('days') days?: string) {
    return this.adminStats.usersByDay(days ? Number(days) : 7);
  }

  @Get('stats/orders')
  statsOrders(@Query('days') days?: string) {
    return this.adminStats.ordersByDay(days ? Number(days) : 7);
  }

  @Get('stats/orders/by-product')
  @RequireAdminConsoleRole(AdminConsoleRole.FINANCE_ADMIN)
  statsOrdersByProduct() {
    return this.adminStats.ordersByProduct();
  }

  @Get('stats/quota')
  statsQuota(@Query('days') days?: string) {
    return this.afQuotaSvc.history(days ? Number(days) : 7);
  }

  @Get('audit-logs')
  @RequireAdminConsoleRole(AdminConsoleRole.DEVELOPER)
  auditLogs(
    @Query('take') take?: string,
    @Query('action') action?: string,
    @Query('operatorId') operatorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.list({
      take: take ? Number(take) : undefined,
      action,
      operatorId,
      from,
      to,
    });
  }

  @Get('matches/:matchId/user-preview')
  userPreview(
    @Param('matchId') matchId: string,
    @Query('view') view?: string,
  ) {
    const v =
      view === 'locked' || view === 'unlocked' ? view : 'guest';
    return this.matchPreview.getUserPreview(matchId, v);
  }

  @Get('ingest/bundles')
  listBundles() {
    return this.orchestrator.listBundles();
  }

  @Post('ingest/bundles/:bundleId/run')
  @ApiOperation({ summary: '一键入库 Bundle' })
  @RequireAdminConsoleRole(AdminConsoleRole.OPS_ADMIN)
  async runBundle(
    @Param('bundleId') bundleId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.orchestrator.runBundle(bundleId, {
      season: Number(body.season) || undefined,
      wcSeason: Number(body.wcSeason) || undefined,
      delayBetweenMs: Number(body.delayBetweenMs) || undefined,
      maxPages: Number(body.maxPages) || undefined,
      maxTeams: Number(body.maxTeams) || undefined,
      lookbackDays: body.lookbackDays != null ? Number(body.lookbackDays) : undefined,
      lookaheadDays:
        body.lookaheadDays != null ? Number(body.lookaheadDays) : undefined,
      batchSize: body.batchSize != null ? Number(body.batchSize) : undefined,
      skipAiReport: body.skipAiReport === true || body.skipAiReport === 'true',
      maxRounds: body.maxRounds != null ? Number(body.maxRounds) : undefined,
      delayBetweenMatchesMs:
        body.delayBetweenMatchesMs != null
          ? Number(body.delayBetweenMatchesMs)
          : undefined,
      dryRun: body.dryRun === true || body.dryRun === 'true',
    });
    await this.audit.log({
      action: 'run_bundle',
      targetType: 'IngestBundle',
      targetId: bundleId,
      afterJson: result as Record<string, unknown>,
    });
    return result;
  }

  @Post('ingest/jobs/:id/cancel')
  @ApiOperation({ summary: '取消进行中的入库任务' })
  @RequireAdminConsoleRole(AdminConsoleRole.OPS_ADMIN)
  async cancelJob(@Param('id') id: string) {
    const result = await this.orchestrator.cancelJob(id);
    await this.audit.log({
      action: 'cancel_job',
      targetType: 'IngestJobRun',
      targetId: id,
      afterJson: result,
    });
    return result;
  }

  @Get('matches/finished-bootstrap/coverage')
  @ApiOperation({ summary: '已结束比赛详情补全覆盖（大白话统计）' })
  finishedBootstrapCoverage(@Query('lookbackDays') lookbackDays?: string) {
    const days = lookbackDays ? Number(lookbackDays) : undefined;
    return this.finishedBootstrap.coverage(days);
  }

  @Get('matches/scheduled-bootstrap/coverage')
  @ApiOperation({ summary: '未开赛详情补全覆盖（未来 N 天 SCHEDULED）' })
  scheduledBootstrapCoverage(@Query('lookaheadDays') lookaheadDays?: string) {
    const days = lookaheadDays ? Number(lookaheadDays) : 10;
    return this.scheduledBootstrap.coverage(days);
  }

  @Get('ingest/jobs')
  listJobs(@Query('take') take?: string) {
    return this.orchestrator.listJobs(
      take ? Math.min(100, Number(take) || 30) : 30,
    );
  }

  @Get('ingest/jobs/:id')
  getJob(
    @Param('id') id: string,
    @Query('itemsTake') itemsTake?: string,
    @Query('itemsSkip') itemsSkip?: string,
  ) {
    return this.orchestrator.getJob(id, {
      itemsTake: itemsTake ? Number(itemsTake) : undefined,
      itemsSkip: itemsSkip ? Number(itemsSkip) : undefined,
    });
  }

  @Get('live/coverage')
  @ApiOperation({ summary: '进行中 af-f-* 场次赛中数据健康度' })
  getLiveCoverage(@Query('take') take?: string) {
    return this.liveCoverageSvc.coverage(take ? Number(take) : 30);
  }

  @Post('live/tick-facts')
  @ApiOperation({ summary: '手动触发赛中 events/statistics 同步' })
  tickLiveFacts() {
    return this.liveFactsIngest.runLiveFactsTick({ minIntervalSec: 0 });
  }

  @Post('live/tick-players')
  @ApiOperation({ summary: '手动触发赛中球员统计同步' })
  tickLivePlayers() {
    return this.liveFactsIngest.runLivePlayersTick({ minIntervalSec: 0 });
  }

  @Post('live/tick-standings')
  @ApiOperation({ summary: '手动刷新 LIVE 涉及联赛积分榜物化' })
  tickLiveStandings() {
    return this.liveStandingsTick.runTick({ minIntervalSec: 0, force: true });
  }

  @Post('matches/:matchId/sync-live-facts')
  @ApiOperation({ summary: '单场强制同步赛中 facts（events/statistics/时钟）' })
  syncMatchLiveFacts(@Param('matchId') matchId: string) {
    return this.liveFactsIngest.syncLiveFactsForMatch(matchId, { force: true });
  }

  @Post('matches/reconcile-live')
  @ApiOperation({ summary: '近窗比分轮询 + 修正假 LIVE' })
  async reconcileLive() {
    const poll = await this.reconcile.pollRecent();
    const fix = await this.reconcile.reconcileStaleLive();
    return { poll, fix };
  }

  @Post('intel/batch')
  @ApiOperation({ summary: '[已退役] 批量补预测 / 整场情报' })
  runIntelBatch() {
    throwLegacyPipelineRetired();
  }

  @Post('matches/:matchId/predictions/sync')
  @ApiOperation({ summary: '[已退役] 单场同步 AF 预测' })
  syncMatchPrediction() {
    throwLegacyPipelineRetired();
  }

  @Post('matches/:matchId/reports/pre-match-intel-long')
  @ApiOperation({ summary: '[已退役] 赛前深度情报长文' })
  generatePreMatchIntelLong() {
    throwLegacyPipelineRetired();
  }

  @Post('matches/:matchId/reports/post-match-tactical-long')
  @ApiOperation({ summary: '[已退役] 完赛战术复盘长文' })
  generatePostMatchTacticalLong() {
    throwLegacyPipelineRetired();
  }

  @Post('matches/:matchId/tactics/generate')
  @ApiOperation({ summary: '[已退役] 战术推演沙盘' })
  generateTacticsSandbox() {
    throwLegacyPipelineRetired();
  }

  @Post('matches/:matchId/pipeline/intel-full')
  runMatchPipeline() {
    throwLegacyPipelineRetired();
  }

  @Post('ai/matches/:matchId/generate')
  @ApiOperation({ summary: '[已退役] 仅生成 DeepSeek 分析' })
  generateAiOnly() {
    throwLegacyPipelineRetired();
  }

  @Get('ai/reports/ops-list')
  @ApiOperation({ summary: 'AI 报告运维列表（含失败 Tab）' })
  listAiReportsOps(
    @Query('tab') tab?: string,
    @Query('take') take?: string,
  ) {
    const t =
      tab === 'draft' || tab === 'published' || tab === 'failed' ? tab : 'all';
    return this.aiOps.listOpsReports(t, take ? Number(take) : 50);
  }

  @Get('ai/reports')
  @ApiOperation({ summary: 'AI 报告列表（Admin）' })
  listAiReports(
    @Query('matchId') matchId?: string,
    @Query('status') status?: string,
    @Query('reportType') reportType?: string,
    @Query('take') take?: string,
  ) {
    return this.prisma.aiReport.findMany({
      where: {
        ...(matchId ? { matchId } : {}),
        ...(status ? { status: status as never } : {}),
        ...(reportType ? { reportType: reportType as never } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(100, Number(take) || 50),
      select: {
        id: true,
        matchId: true,
        reportType: true,
        status: true,
        publishedAt: true,
        publishedKey: true,
        inputHash: true,
        freeSummary: true,
        updatedAt: true,
        createdAt: true,
      },
    });
  }

  @Get('ai/reports/:id')
  @ApiOperation({ summary: 'AI 报告详情（Admin）' })
  async getAiReport(@Param('id') id: string) {
    const report = await this.prisma.aiReport.findUnique({ where: { id } });
    if (!report) return { error: 'not_found' };
    return report;
  }

  @Post('ai/reports/:id/publish')
  @ApiOperation({ summary: '发布 AI 报告（归档同场同类型旧 PUBLISHED）' })
  @RequireAdminConsoleRole(AdminConsoleRole.CONTENT_ADMIN)
  async publishAiReport(
    @Param('id') id: string,
    @Body() body: { forcedPublish?: boolean; reason?: string },
    @CurrentUser() user: RequestUser,
  ) {
    const forced = body?.forcedPublish === true;
    const result = await this.aiPublish.publishById(id, {
      forcedPublish: forced,
      reason: body?.reason,
      userId: user.id,
    });
    await this.audit.log({
      action: forced ? 'wc_ai_forced_publish' : 'publish_ai',
      targetType: 'AiReport',
      targetId: id,
      afterJson: { ...result, reason: body?.reason },
    });
    return result;
  }

  @Post('ai/reports/:id/archive')
  @ApiOperation({ summary: '归档 AI 报告（下线 C 端可见）' })
  @RequireAdminConsoleRole(AdminConsoleRole.CONTENT_ADMIN)
  async archiveAiReport(@Param('id') id: string) {
    const result = await this.aiPublish.archiveById(id);
    await this.audit.log({
      action: 'archive_ai',
      targetType: 'AiReport',
      targetId: id,
      afterJson: result,
    });
    return result;
  }

  @Post('ingest/jobs/:id/retry-failed')
  @ApiOperation({ summary: '重跑任务中 FAILED 场次（单场 sync-full）' })
  @RequireAdminConsoleRole(AdminConsoleRole.OPS_ADMIN)
  async retryFailedJob(@Param('id') id: string) {
    const result = await this.orchestrator.retryFailedItems(id);
    await this.audit.log({
      action: 'retry_failed_job',
      targetType: 'IngestJobRun',
      targetId: id,
      afterJson: result,
    });
    return result;
  }

  @Post('ai/matches/:matchId/regenerate')
  @ApiOperation({ summary: '强制重生成 AI 草稿（不自动发布）' })
  @RequireAdminConsoleRole(AdminConsoleRole.CONTENT_ADMIN)
  async regenerateAiDraft(
    @Param('matchId') matchId: string,
    @Body() body: { reportType?: string },
  ) {
    const type =
      body?.reportType === 'POST_MATCH' ? AiReportType.POST_MATCH : AiReportType.PRE_MATCH;
    await this.redis.setString(`ai:generating:${matchId}:${type}`, '1', 600);
    const result =
      type === AiReportType.POST_MATCH
        ? await this.postMatchReport.generatePostMatch(matchId)
        : await this.aiReport.generate(matchId, {
            skipExternalPreparation: true,
            forceRegenerate: true,
          });
    await this.redis.del(`ai:generating:${matchId}:${type}`);
    await this.audit.log({
      action: 'regenerate_ai',
      targetType: 'Match',
      targetId: matchId,
      afterJson: { reportType: type },
    });
    return result;
  }

  @Get('matches/:matchId/ops-status')
  @ApiOperation({ summary: '单场运维仪表盘聚合状态' })
  matchOpsStatus(@Param('matchId') matchId: string) {
    return this.matchOps.getOpsStatus(matchId);
  }

  @Get('matches/ops-list')
  @ApiOperation({ summary: '比赛运维列表（筛选）' })
  matchesOpsList(
    @Query('status') status?: string,
    @Query('kickoffFrom') kickoffFrom?: string,
    @Query('kickoffTo') kickoffTo?: string,
    @Query('competitionCode') competitionCode?: string,
    @Query('coverageHealth') coverageHealth?: string,
    @Query('aiStatus') aiStatus?: string,
    @Query('hasFailedJob') hasFailedJob?: string,
    @Query('take') take?: string,
  ) {
    return this.matchesList.opsList({
      status,
      kickoffFrom,
      kickoffTo,
      competitionCode,
      coverageHealth: coverageHealth as never,
      aiStatus: aiStatus as never,
      hasFailedJob:
        hasFailedJob === 'true' ? true : hasFailedJob === 'false' ? false : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Post('matches/:matchId/rebuild-detail')
  @ApiOperation({ summary: '重建比赛详情 BFF 缓存' })
  @RequireAdminConsoleRole(AdminConsoleRole.DEVELOPER)
  async rebuildMatchDetail(@Param('matchId') matchId: string) {
    const result = await this.matchRebuild.rebuildDetail(matchId);
    await this.audit.log({
      action: 'rebuild_detail',
      targetType: 'Match',
      targetId: matchId,
      afterJson: result,
    });
    return result;
  }

  @Get('orders/export.csv')
  @RequireAdminConsoleRole(AdminConsoleRole.FINANCE_ADMIN)
  async exportOrders(@Res() res: Response) {
    const rows = await this.adminUsers.listOrders({ take: 5000 });
    await this.audit.log({ action: 'export_orders', targetType: 'Order' });
    const header = 'orderNo,amount,status,product,paidAt,userId,matchId\n';
    const body = rows
      .map((o) =>
        [
          o.orderNo,
          o.amount,
          o.status,
          o.product,
          o.paidAt?.toISOString() ?? '',
          o.userId,
          o.matchId ?? '',
        ].join(','),
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(header + body);
  }

  @Get('matches')
  listMatches(
    @Query('status') status?: string,
    @Query('take') take?: string,
  ) {
    return this.prisma.match.findMany({
      where: status ? { status: status as never } : undefined,
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: { select: { code: true, nameCn: true } },
      },
      orderBy: { kickoffTime: 'asc' },
      take: Math.min(250, Number(take) || 100),
    });
  }

  @Get('af/coverage/window')
  @ApiOperation({ summary: '近窗未开赛 AF bundle 覆盖率（仪表盘）' })
  afCoverageWindow(
    @Query('lookaheadHours') lookaheadHours?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    return this.afCoverage.coverageWindow({
      lookaheadHours: lookaheadHours ? Number(lookaheadHours) : undefined,
      take: take ? Number(take) : undefined,
      status: status as never,
    });
  }

  @Post('af/sync-pre-match')
  @ApiOperation({ summary: '批量同步近窗未开赛 AF Raw' })
  afSyncPreMatch(@Body() body: Record<string, unknown>) {
    return this.afSync.syncPreMatchWindow({
      lookaheadHours: Number(body.lookaheadHours) || undefined,
      maxMatches: Number(body.maxMatches) || undefined,
    });
  }

  @Post('af/sync-live')
  @ApiOperation({ summary: '批量同步进行中 AF Raw' })
  afSyncLive() {
    return this.afSync.syncLiveMatches();
  }

  @Post('af/sync-finished')
  @ApiOperation({ summary: '批量同步近窗已结束 AF Raw' })
  afSyncFinished(@Body() body: Record<string, unknown>) {
    return this.afSync.syncFinishedMatches({
      lookbackHours: Number(body.lookbackHours) || undefined,
    });
  }

  @Get('af/sync-logs')
  @ApiOperation({ summary: '全局 AfSyncLog 最近记录' })
  afGlobalSyncLogs(
    @Query('limit', new DefaultValuePipe(50)) limit: number,
    @Query('endpoint') endpoint?: string,
  ) {
    return this.afSync.listGlobalSyncLogs(Math.min(100, limit), endpoint);
  }

  @Get('af/leagues/catalog')
  @ApiOperation({ summary: 'B2：联赛 Catalog 状态列表' })
  afLeaguesCatalog(@Query('season') season?: string) {
    const s = season ? parseInt(season, 10) : undefined;
    return this.afCatalogOps.listLeaguesCatalog(Number.isFinite(s) ? s : undefined);
  }

  @Post('af/leagues/:code/sync-catalog')
  @ApiOperation({ summary: 'B2：同步联赛 standings + 榜单' })
  syncLeagueCatalog(
    @Param('code') code: string,
    @Query('season') season?: string,
  ) {
    const s = season ? parseInt(season, 10) : undefined;
    return this.afCatalogOps.syncLeagueCatalog(code, Number.isFinite(s) ? s : undefined);
  }

  @Get('af/teams')
  @ApiOperation({ summary: 'B4：AF 球队列表' })
  afTeamsList(
    @Query('take') take?: string,
    @Query('q') q?: string,
  ) {
    return this.afCatalogOps.listAfTeams({
      take: take ? Number(take) : undefined,
      q,
    });
  }

  @Get('af/teams/:teamId/catalog')
  @ApiOperation({ summary: 'B4：球队档案状态' })
  afTeamCatalog(
    @Param('teamId') teamId: string,
    @Query('season') season?: string,
  ) {
    const s = season ? parseInt(season, 10) : undefined;
    return this.afCatalogOps.getTeamCatalog(teamId, Number.isFinite(s) ? s : undefined);
  }

  @Get('af/players')
  @ApiOperation({ summary: 'B4：AF 球员列表' })
  afPlayersList(
    @Query('take') take?: string,
    @Query('q') q?: string,
  ) {
    return this.afCatalogOps.listAfPlayers({
      take: take ? Number(take) : undefined,
      q,
    });
  }

  @Get('af/players/:playerId/catalog')
  @ApiOperation({ summary: 'B4：球员档案状态' })
  afPlayerCatalog(@Param('playerId') playerId: string) {
    return this.afCatalogOps.getPlayerCatalog(playerId);
  }

  @Get('af/matches/:matchId/enrichment')
  @ApiOperation({ summary: 'B4/B5：单场 enrichment 状态' })
  afMatchEnrichment(@Param('matchId') matchId: string) {
    return this.afCatalogOps.getMatchEnrichment(matchId);
  }

  @Post('af/teams/:teamId/sync-catalog')
  @ApiOperation({ summary: 'B4：同步球队转会与荣誉' })
  syncTeamCatalog(
    @Param('teamId') teamId: string,
    @Query('season') season?: string,
  ) {
    const s = season ? parseInt(season, 10) : undefined;
    return this.afCatalog.syncTeamCatalog(teamId, Number.isFinite(s) ? s : undefined);
  }

  @Post('af/players/:playerId/sync-catalog')
  @ApiOperation({ summary: 'B4：同步球员荣誉与长期缺阵' })
  syncPlayerCatalog(@Param('playerId') playerId: string) {
    return this.afCatalog.syncPlayerCatalog(playerId);
  }

  @Post('af/matches/:matchId/sync-full')
  @ApiOperation({ summary: '单场 API-Football Raw 全量同步' })
  @RequireAdminConsoleRole(AdminConsoleRole.OPS_ADMIN)
  async syncAfMatchFull(
    @Param('matchId') matchId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.afSync.syncSingleMatchFull(matchId, {
      force: body.force === true,
      delayMs: Number(body.delayMs) || undefined,
    });
    await this.audit.log({
      action: 'sync_full',
      targetType: 'Match',
      targetId: matchId,
    });
    return result;
  }

  @Get('af/matches/:matchId/coverage')
  @ApiOperation({ summary: '单场 AF bundle 覆盖率' })
  afMatchCoverage(@Param('matchId') matchId: string) {
    return this.afSync.getCoverage(matchId);
  }

  @Get('af/matches/:matchId/bundle')
  @ApiOperation({ summary: '单场 AF Raw bundle（Admin）' })
  async afMatchBundle(@Param('matchId') matchId: string) {
    const bundle = await this.afBundle.getByMatchId(matchId);
    if (!bundle) return { matchId, bundle: null };
    return { matchId, bundle };
  }

  @Get('af/matches/:matchId/sync-logs')
  @ApiOperation({ summary: '单场 AfSyncLog 最近记录' })
  afSyncLogs(
    @Param('matchId') matchId: string,
    @Query('limit', new DefaultValuePipe(50)) limit: number,
  ) {
    return this.afSync.listSyncLogs(matchId, Math.min(100, limit));
  }

  @Get('matches/:matchId')
  async matchDetail(@Param('matchId') matchId: string) {
    const m = await this.admin.getMatch(matchId);
    if (!m) return { error: 'not_found' };
    const facts = await this.prisma.matchFacts.findUnique({
      where: { matchId },
    });
    return {
      match: m,
      facts: facts
        ? {
            hasLineups: !!facts.lineups,
            hasEvents: !!facts.events,
            hasInjuries: !!facts.injuriesJson,
            afLastSyncedAt: facts.afLastSyncedAt,
          }
        : null,
    };
  }
}
