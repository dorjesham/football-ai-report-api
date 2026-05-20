import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';
import { AdminService } from '../admin/admin.service';
import { MatchStatusReconcileService } from '../data-pipeline/match-status-reconcile.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminSystemStatusService } from './admin-system-status.service';

const LIVE_CRON_ENDPOINTS = [
  'live-facts-ingest',
  'live-players-ingest',
  'live-standings-tick',
] as const;

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly admin: AdminService,
    private readonly config: ConfigService,
    private readonly afQuota: ApiFootballQuotaService,
    private readonly reconcile: MatchStatusReconcileService,
    private readonly prisma: PrismaService,
    private readonly ops: AdminOpsService,
    private readonly stats: AdminStatsService,
    private readonly systemStatus: AdminSystemStatusService,
  ) {}

  private buildLiveEnrichmentConfig() {
    const enableCronSync = this.config.get<boolean>('enableCronSync') === true;
    return {
      enableCronSync,
      enableAfLiveFactsCron:
        this.config.get<boolean>('enableAfLiveFactsCron') === true,
      enableAfLivePlayersCron:
        this.config.get<boolean>('enableAfLivePlayersCron') === true,
      enableLiveStandingsTick:
        this.config.get<boolean>('enableLiveStandingsTick') === true,
      enableLiveCommentaryLlm:
        this.config.get<boolean>('enableLiveCommentaryLlm') === true,
      afLiveFactsIntervalSec:
        this.config.get<number>('afLiveFactsIntervalSec') ?? 90,
      afLivePlayersIntervalSec:
        this.config.get<number>('afLivePlayersIntervalSec') ?? 120,
      liveStandingsTickIntervalSec:
        this.config.get<number>('liveStandingsTickIntervalSec') ?? 600,
      afLiveFactsMaxPerTick:
        this.config.get<number>('afLiveFactsMaxPerTick') ?? 4,
      afLivePlayersMaxPerTick:
        this.config.get<number>('afLivePlayersMaxPerTick') ?? 3,
    };
  }

  async overview() {
    const dash = await this.admin.dashboard();
    const liveEnrichmentConfig = this.buildLiveEnrichmentConfig();
    const [likelyLive, rawLive, afMatches, afLiveMatchCount, recentJobs, recentLiveCron] =
      await Promise.all([
        this.reconcile.countLikelyLiveNow(),
        this.prisma.match.count({ where: { status: MatchStatus.LIVE } }),
        this.prisma.match.count({
          where: { dataSource: 'API_FOOTBALL' as never },
        }),
        this.prisma.match.count({
          where: {
            status: MatchStatus.LIVE,
            externalId: { startsWith: 'af-f-' },
          },
        }),
        this.prisma.ingestJobRun.findMany({
          orderBy: { startedAt: 'desc' },
          take: 10,
        }),
        this.prisma.apiLog.findMany({
          where: {
            provider: 'cron',
            endpoint: { in: [...LIVE_CRON_ENDPOINTS] },
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            endpoint: true,
            success: true,
            message: true,
            createdAt: true,
          },
        }),
      ]);
    const quota = await this.afQuota.snapshot();
    const [cards, todos, matchHealth, recentIncidents, charts, systemStatus, quota7d] =
      await Promise.all([
        this.ops.getOverviewCards(),
        this.ops.getTodos(),
        this.ops.getMatchHealthSummary(),
        this.ops.getRecentIncidents(),
        this.stats.getOverviewCharts(7),
        this.systemStatus.getSystemStatus(),
        this.afQuota.history(7),
      ]);
    const liveEnrichment = {
      ...liveEnrichmentConfig,
      afLiveMatchCount,
      recentCronLogs: recentLiveCron,
    };
    return {
      ...dash,
      afMatchCount: afMatches,
      liveMatchCountRaw: rawLive,
      liveMatchCountLikely: likelyLive,
      afQuota: quota,
      liveEnrichment,
      env: {
        hasApiFootballKey: !!this.config.get<string>('apiFootballApiKey')?.trim(),
        hasDeepseekKey: !!this.config.get<string>('deepseekApiKey'),
        enableCronSync: liveEnrichmentConfig.enableCronSync,
        enableFootballData:
          this.config.get<boolean>('enableFootballData') === true,
        enableAfLiveFactsCron: liveEnrichmentConfig.enableAfLiveFactsCron,
        enableAfLivePlayersCron: liveEnrichmentConfig.enableAfLivePlayersCron,
        enableLiveStandingsTick: liveEnrichmentConfig.enableLiveStandingsTick,
        enableLiveCommentaryLlm: liveEnrichmentConfig.enableLiveCommentaryLlm,
        nodeEnv: this.config.get<string>('nodeEnv'),
      },
      recentJobs,
      cards,
      todos,
      matchHealth,
      recentIncidents,
      charts: { ...charts, quota7d },
      systemStatus,
      guideV2: {
        enableAfCatalogSync:
          this.config.get<boolean>('enableAfCatalogSync') === true,
        enableAfOddsLiveSync:
          this.config.get<boolean>('enableAfOddsLiveSync') === true,
        afSyncSeason: this.config.get<number>('afSyncSeason') ?? 2025,
        afOddsLiveLeagues: this.config.get<number[]>('afOddsLiveLeagues') ?? [],
        metricsPath: '/metrics',
      },
    };
  }
}
