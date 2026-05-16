import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, Prisma } from '@prisma/client';
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
      this.config.get<number>('afLiveFactsIntervalSec') ?? 30;
    const liveFactsMax = this.config.get<number>('afLiveFactsMaxPerTick') ?? 24;
    const fastPollEnabled =
      this.config.get<boolean>('enableMatchLiveFastPoll') === true;
    const liveFactsCron =
      this.config.get<boolean>('enableAfLiveFactsCron') === true;

    const ticksPerDay = liveFactsCron ? Math.floor(86400 / liveFactsInterval) : 0;
    const liveFactsPerDay =
      ticksPerDay * Math.min(liveFactsMax, liveCount) * AF_CALLS_PER_LIVE_FACTS_SYNC;

    const fastPollPerDay = fastPollEnabled
      ? Math.floor(86400 / 10) * Math.min(liveCount, 40) * AF_CALLS_PER_FAST_POLL
      : 0;

    const finishedPerDay = 120 * AF_CALLS_PER_FINISHED_FACTS;

    const historical24h = await this.historicalUsage(24, opts?.competitionCode);

    return {
      schema: 'api-football-cost-estimate-v1',
      assumptions: {
        liveFactsIntervalSec: liveFactsInterval,
        liveFactsMaxPerTick: liveFactsMax,
        liveFactsCronEnabled: liveFactsCron,
        fastPollEnabled,
        currentLiveAfMatches: liveCount,
      },
      projectedDailyCalls: {
        liveFactsIngest: liveFactsPerDay,
        liveFastPoll: fastPollPerDay,
        finishedFactsEnrich: finishedPerDay,
        total:
          liveFactsPerDay + fastPollPerDay + finishedPerDay,
      },
      historical24h,
      cacheMitigation: {
        note: '读路径 Redis TTL 不减少 AF 写入；调高 CACHE_* 仅降低 DB/CPU。',
        cacheMatchLiveTtlSec:
          this.config.get<number>('cacheMatchLiveTtlSec') ?? 5,
        cacheMatchPhasePreTtlSec:
          this.config.get<number>('cacheMatchPhasePreTtlSec') ?? 30,
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
