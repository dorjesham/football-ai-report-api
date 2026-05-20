import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, Prisma } from '@prisma/client';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';
import { PrismaService } from '../prisma/prisma.service';

/** 单次上游调用估算（fixture / events / statistics 等） */
const AF_CALLS_PER_LIVE_FACTS_SYNC = 2;
const AF_CALLS_PER_FINISHED_FACTS = 4;
const AF_CALLS_PER_FAST_POLL = 1;

@Injectable()
export class ApiFootballCostEstimatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly afQuota: ApiFootballQuotaService,
  ) {}

  /**
   * 基于 Cron 配置与当前 LIVE 场次数，估算每日 AF 请求量（工程验收用，非账单）。
   */
  async estimateDaily(opts?: { competitionCode?: string }) {
    const liveCount = await this.prisma.match.count({
      where: {
        status: { in: [MatchStatus.LIVE, MatchStatus.SCHEDULED] },
        ...(opts?.competitionCode
          ? { competition: { code: opts.competitionCode } }
          : {}),
        externalId: { startsWith: 'af-f-' },
      },
    });

    const liveFactsInterval =
      this.config.get<number>('afLiveFactsIntervalSec') ?? 90;
    const liveFactsMax = this.config.get<number>('afLiveFactsMaxPerTick') ?? 4;
    const fastPollEnabled =
      this.config.get<boolean>('enableMatchLiveFastPoll') === true;
    const liveFactsCron =
      this.config.get<boolean>('enableAfLiveFactsCron') === true;
    const nearWindowPoll =
      this.config.get<boolean>('enableMatchFdLivePoll') === true;

    const ticksPerDay = liveFactsCron ? Math.floor(86400 / liveFactsInterval) : 0;
    const liveFactsPerDay =
      ticksPerDay * Math.min(liveFactsMax, liveCount) * AF_CALLS_PER_LIVE_FACTS_SYNC;

    const fastPollPerDay = fastPollEnabled
      ? Math.floor(86400 / 10) * Math.min(liveCount, 40) * AF_CALLS_PER_FAST_POLL
      : 0;

    const nearWindowPerDay = nearWindowPoll
      ? Math.floor(86400 / 300) * Math.min(liveCount, 30) * AF_CALLS_PER_FAST_POLL
      : 0;

    const finishedMax = this.config.get<number>('afMatchFactsMaxPerTick') ?? 20;
    const finishedPerDay =
      (this.config.get<boolean>('enableAfMatchFactsCron') ? 4 : 0) *
      finishedMax *
      AF_CALLS_PER_FINISHED_FACTS;

    const fixturesCronPerDay = this.config.get<boolean>('enableCronSync') ? 18 : 0;
    const standingsCronPerDay = this.config.get<boolean>('enableCronSync') ? 12 : 0;

    const projectedTotal =
      liveFactsPerDay +
      fastPollPerDay +
      nearWindowPerDay +
      finishedPerDay +
      fixturesCronPerDay +
      standingsCronPerDay;

    const quota = await this.afQuota.snapshot();
    const dailyLimit = quota.limit;

    const historical24h = await this.historicalUsage(24, opts?.competitionCode);

    return {
      schema: 'api-football-cost-estimate-v2',
      assumptions: {
        liveFactsIntervalSec: liveFactsInterval,
        liveFactsMaxPerTick: liveFactsMax,
        liveFactsCronEnabled: liveFactsCron,
        fastPollEnabled,
        nearWindowPollEnabled: nearWindowPoll,
        currentLiveAfMatches: liveCount,
        dailyQuotaLimit: dailyLimit,
      },
      quotaToday: quota,
      projectedDailyCalls: {
        liveFactsIngest: liveFactsPerDay,
        liveFastPoll: fastPollPerDay,
        nearWindowPoll: nearWindowPerDay,
        finishedFactsEnrich: finishedPerDay,
        fixturesCron: fixturesCronPerDay,
        standingsCron: standingsCronPerDay,
        total: projectedTotal,
      },
      overQuotaRisk: projectedTotal > dailyLimit * 0.9,
      historical24h,
      cacheMitigation: {
        note: 'C 端应读 DB+Redis BFF；生产关闭 /football-feed 与 rankings AF 回退。',
        enableFootballFeedPublic:
          this.config.get<boolean>('enableFootballFeedPublic') === true,
        enableRankingsAfFallback:
          this.config.get<boolean>('enableRankingsAfFallback') === true,
        cacheMatchLiveTtlSec: this.config.get<number>('cacheMatchLiveTtlSec') ?? 15,
        cacheRankingsTopscorersTtlSec:
          this.config.get<number>('cacheRankingsTopscorersTtlSec') ?? 21600,
        cacheLeaguesStandingsTtlSec:
          this.config.get<number>('cacheLeaguesStandingsTtlSec') ?? 1800,
      },
    };
  }

  private async historicalUsage(hours: number, competitionCode?: string) {
    const since = new Date(Date.now() - hours * 3600_000);
    const rows = await this.prisma.apiLog.findMany({
      where: {
        provider: { in: ['api-football', 'live-sync', 'cron'] },
        createdAt: { gte: since },
        OR: [
          { endpoint: { contains: 'af' } },
          { endpoint: { contains: 'live' } },
          { endpoint: { contains: 'fixture' } },
        ],
      },
      select: { success: true, endpoint: true },
      take: 5000,
    });

    const byEndpoint = new Map<string, number>();
    for (const r of rows) {
      const k = r.endpoint ?? 'unknown';
      byEndpoint.set(k, (byEndpoint.get(k) ?? 0) + 1);
    }

    return {
      hours,
      competitionCode: competitionCode ?? null,
      sample: rows.length,
      successRate: rows.length
        ? rows.filter((r) => r.success).length / rows.length
        : null,
      byEndpoint: Object.fromEntries(byEndpoint),
    };
  }
}
