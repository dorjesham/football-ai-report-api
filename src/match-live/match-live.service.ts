import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { extractOdds1x2Teaser, ODDS_DISCLAIMER } from '../api-football/af-pre-match-mapper.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { computeLiveStatusSyncHint } from '../matches/match-status-clock.util';
import { buildCommentaryLines } from './commentary.builder';
import { parseMatchEventsStorage } from './match-events-storage.util';
import {
  enrichKeyMetricsAvailability,
  keyMetricsFromAfTeamStats,
  metricLabelsZh,
  type LiveKeyMetrics,
  type LiveKeyMetricsWithAvailability,
} from './live-key-metrics.util';
import type { LiveMetaJson } from './live-event.types';

export const MATCH_LIVE_SCHEMA_V1 = 'match-live-v1' as const;

export type MatchLiveResponse = {
  schema: typeof MATCH_LIVE_SCHEMA_V1;
  matchId: string;
  match: {
    status: string;
    kickoffTime: string;
    homeScore: number | null;
    awayScore: number | null;
    liveStatusSyncHint: ReturnType<typeof computeLiveStatusSyncHint>;
  };
  events: ReturnType<typeof parseMatchEventsStorage>['items'];
  teamStats: unknown;
  keyMetrics: LiveKeyMetrics | null;
  /** 每项指标含 present/unavailable，便于 UI 展示「无数据」 */
  keyMetricsAvailability: LiveKeyMetricsWithAvailability | null;
  metricLabels: Record<string, string>;
  commentary: string[];
  latestOddsTeaser: ReturnType<typeof extractOdds1x2Teaser> | null;
  oddsDisclaimer: string;
  meta: {
    seq: number;
    afLiveLastSyncedAt: string | null;
    fdLiveLastSyncedAt: string | null;
    dataAvailability: {
      events: 'present' | 'partial' | 'missing';
      teamStats: 'present' | 'partial' | 'missing';
    };
  };
};

@Injectable()
export class MatchLiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async build(matchId: string, opts?: { maxEvents?: number }): Promise<MatchLiveResponse> {
    const maxEvents = Math.min(100, Math.max(5, opts?.maxEvents ?? 50));
    const cacheKey = `matches:live:${matchId}`;
    const ttl =
      this.config.get<number>('cacheMatchLiveTtlSec') ??
      (this.config.get<number>('cacheMatchIntelAnonTtlSec') ?? 5);

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        matchFacts: true,
        oddsSnapshots: {
          where: { phase: 'LIVE' },
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const facts = match.matchFacts;
    const eventsStorage = parseMatchEventsStorage(facts?.events);
    const events = eventsStorage.items.slice(-maxEvents);

    const tsRaw = facts?.teamStats;
    let keyMetrics: LiveKeyMetrics | null = null;
    if (tsRaw && typeof tsRaw === 'object') {
      const ts = tsRaw as { apiFootball?: unknown; footballData?: { keyMetrics?: LiveKeyMetrics } };
      if (ts.footballData?.keyMetrics) {
        keyMetrics = ts.footballData.keyMetrics;
      } else if (ts.apiFootball) {
        keyMetrics = keyMetricsFromAfTeamStats(ts.apiFootball);
      }
    }

    const metaJson = (facts?.liveMetaJson ?? {}) as LiveMetaJson;
    const hasEvents = events.length > 0;
    const hasStats = keyMetrics != null;

    const liveOdds = match.oddsSnapshots[0];
    const latestOddsTeaser =
      liveOdds ? extractOdds1x2Teaser(liveOdds.marketsJson) : null;

    const payload: MatchLiveResponse = {
      schema: MATCH_LIVE_SCHEMA_V1,
      matchId: match.id,
      match: {
        status: match.status,
        kickoffTime: match.kickoffTime.toISOString(),
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        liveStatusSyncHint: computeLiveStatusSyncHint({
          status: match.status,
          kickoffTime: match.kickoffTime,
        }),
      },
      events,
      teamStats: tsRaw ?? null,
      keyMetrics,
      keyMetricsAvailability: enrichKeyMetricsAvailability(keyMetrics),
      metricLabels: metricLabelsZh(),
      commentary: buildCommentaryLines(events),
      latestOddsTeaser,
      oddsDisclaimer: ODDS_DISCLAIMER,
      meta: {
        seq: metaJson.seq ?? 0,
        afLiveLastSyncedAt: facts?.afLiveLastSyncedAt?.toISOString() ?? null,
        fdLiveLastSyncedAt: facts?.fdLiveLastSyncedAt?.toISOString() ?? null,
        dataAvailability: {
          events: hasEvents ? 'present' : facts ? 'partial' : 'missing',
          teamStats: hasStats ? 'present' : facts ? 'partial' : 'missing',
        },
      },
    };

    if (match.status === MatchStatus.LIVE && this.redis.enabled) {
      void this.redis.setJson(cacheKey, payload, ttl);
    }

    return payload;
  }

  async getCachedOrBuild(matchId: string): Promise<MatchLiveResponse> {
    const cacheKey = `matches:live:${matchId}`;
    const hit = await this.redis.getJson<MatchLiveResponse>(cacheKey);
    if (hit) return hit;
    return this.build(matchId);
  }
}
