import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { extractOdds1x2Teaser, ODDS_DISCLAIMER } from '../api-football/af-pre-match-mapper.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { computeLiveStatusSyncHint } from '../matches/match-status-clock.util';
import { buildCommentaryLines } from './commentary.builder';
import { buildCommentaryV2, type CommentaryLineV2 } from './commentary-v2.builder';
import { parseMatchEventsStorage } from './match-events-storage.util';
import {
  enrichKeyMetricsAvailability,
  keyMetricsFromAfTeamStats,
  metricLabelsZh,
  type LiveKeyMetrics,
  type LiveKeyMetricsWithAvailability,
} from './live-key-metrics.util';
import type { LiveClockJson, LiveMetaJson } from './live-event.types';
import {
  parseLiveStatsTimeline,
  possessionTimelineForBff,
} from './live-stats-timeline.util';
import { buildLiveZoneHeatmap, type ActivityHeatmapLiveSection } from './live-zone-heatmap.builder';
import {
  extractStatsbombSpatial,
  type MatchSpatialSection,
} from './statsbomb-spatial.extractor';
import { buildStandingsSnippet, type StandingsSnippet } from './live-standings-snippet.util';
import { MatchPresentationEnricherService } from '../localization/match-presentation-enricher.service';

export const MATCH_LIVE_SCHEMA_V1 = 'match-live-v1' as const;
export const MATCH_LIVE_SCHEMA_V2 = 'match-live-v2' as const;

export type MatchLivePlayerStatRow = {
  afPlayerId: number;
  playerId: string | null;
  playerName: string;
  teamSide: string;
  minutes: number | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shotsOn: number | null;
};

export type MatchLiveResponse = {
  schema: typeof MATCH_LIVE_SCHEMA_V2;
  matchId: string;
  match: {
    status: string;
    statusCn: string | null;
    kickoffTime: string;
    homeScore: number | null;
    awayScore: number | null;
    liveStatusSyncHint: ReturnType<typeof computeLiveStatusSyncHint>;
  };
  clock: LiveClockJson | null;
  events: ReturnType<typeof parseMatchEventsStorage>['items'];
  teamStats: unknown;
  keyMetrics: LiveKeyMetrics | null;
  keyMetricsAvailability: LiveKeyMetricsWithAvailability | null;
  metricLabels: Record<string, string>;
  commentary: string[];
  commentaryV2: CommentaryLineV2[];
  commentaryEnriched: string[] | null;
  playerStats: {
    home: MatchLivePlayerStatRow[];
    away: MatchLivePlayerStatRow[];
    topRated: MatchLivePlayerStatRow[];
  };
  possessionTimeline: Array<{
    elapsed: number | null;
    homePossession: number | null;
    awayPossession: number | null;
  }>;
  possessionTimelineDataQuality: 'MEASURED' | 'MISSING';
  activityHeatmapLive: ActivityHeatmapLiveSection;
  spatial: MatchSpatialSection | null;
  standingsSnippet: StandingsSnippet | null;
  latestOddsTeaser: ReturnType<typeof extractOdds1x2Teaser> | null;
  oddsDisclaimer: string;
  meta: {
    seq: number;
    afLiveLastSyncedAt: string | null;
    fdLiveLastSyncedAt: string | null;
    dataAvailability: {
      events: 'present' | 'partial' | 'missing';
      teamStats: 'present' | 'partial' | 'missing';
      playerStats: 'present' | 'partial' | 'missing';
      spatial: 'present' | 'missing';
      possessionTimeline: 'present' | 'missing';
    };
  };
};

@Injectable()
export class MatchLiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly presentation: MatchPresentationEnricherService,
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
        homeTeam: { select: { id: true, nameCn: true, nameEn: true, externalId: true } },
        awayTeam: { select: { id: true, nameCn: true, nameEn: true, externalId: true } },
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
    const events = this.presentation.enrichEvents(eventsStorage.items.slice(-maxEvents));

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
    const clock = metaJson.clock ?? null;
    const hasEvents = events.length > 0;
    const hasStats = keyMetrics != null;

    const playerRows = await this.prisma.matchPlayerMatchStat.findMany({
      where: { matchId },
      orderBy: [{ rating: 'desc' }, { minutes: 'desc' }],
    });
    const mapPlayer = (r: (typeof playerRows)[0]): MatchLivePlayerStatRow => ({
      afPlayerId: r.afPlayerId,
      playerId: r.playerId,
      playerName: r.playerName,
      teamSide: r.teamSide,
      minutes: r.minutes,
      rating: r.rating,
      goals: r.goals,
      assists: r.assists,
      shots: r.shots,
      shotsOn: r.shotsOn,
    });
    const homePlayers = playerRows.filter((r) => r.teamSide === 'home').map(mapPlayer);
    const awayPlayers = playerRows.filter((r) => r.teamSide === 'away').map(mapPlayer);
    const topRated = [...playerRows]
      .filter((r) => r.rating != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 5)
      .map(mapPlayer);

    const timeline = parseLiveStatsTimeline(facts?.liveStatsTimelineJson);
    const possessionTimeline = possessionTimelineForBff(timeline);

    const activityHeatmapLive = buildLiveZoneHeatmap({
      events,
      playerStats: playerRows.map((r) => ({
        teamSide: r.teamSide,
        shots: r.shots,
        shotsOn: r.shotsOn,
        goals: r.goals,
      })),
    });

    const spatial =
      facts?.rawStatsbomb || match.statsbombMatchId ?
        extractStatsbombSpatial({
          rawStatsbomb: facts?.rawStatsbomb,
          homeTeamName: match.homeTeam.nameCn,
          awayTeamName: match.awayTeam.nameCn,
        })
      : null;

    const standingsSnippet = await buildStandingsSnippet(this.prisma, {
      competitionId: match.competitionId,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoffTime: match.kickoffTime,
    });

    const enrichedRaw = facts?.liveCommentaryEnrichedJson as
      | { lines?: string[] }
      | null
      | undefined;
    const commentaryEnriched =
      Array.isArray(enrichedRaw?.lines) && enrichedRaw.lines.length > 0 ?
        enrichedRaw.lines
      : null;

    const liveOdds = match.oddsSnapshots[0];
    const rawTeaser =
      liveOdds ? extractOdds1x2Teaser(liveOdds.marketsJson) : null;
    const latestOddsTeaser =
      rawTeaser ?
        {
          ...rawTeaser,
          marketCn: this.presentation.oddsMarketCn(rawTeaser.marketName),
        }
      : null;

    const payload: MatchLiveResponse = {
      schema: MATCH_LIVE_SCHEMA_V2,
      matchId: match.id,
      match: {
        status: match.status,
        statusCn: this.presentation.statusCn(String(match.status)),
        kickoffTime: match.kickoffTime.toISOString(),
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        liveStatusSyncHint: computeLiveStatusSyncHint({
          status: match.status,
          kickoffTime: match.kickoffTime,
        }),
      },
      clock,
      events,
      teamStats: tsRaw ?? null,
      keyMetrics,
      keyMetricsAvailability: enrichKeyMetricsAvailability(keyMetrics),
      metricLabels: metricLabelsZh(),
      commentary: buildCommentaryLines(events),
      commentaryV2: buildCommentaryV2(events),
      commentaryEnriched,
      playerStats: {
        home: homePlayers,
        away: awayPlayers,
        topRated,
      },
      possessionTimeline,
      possessionTimelineDataQuality:
        possessionTimeline.length > 0 ? 'MEASURED' : 'MISSING',
      activityHeatmapLive,
      spatial: spatial?.availability === 'present' ? spatial : null,
      standingsSnippet,
      latestOddsTeaser,
      oddsDisclaimer: ODDS_DISCLAIMER,
      meta: {
        seq: metaJson.seq ?? 0,
        afLiveLastSyncedAt: facts?.afLiveLastSyncedAt?.toISOString() ?? null,
        fdLiveLastSyncedAt: facts?.fdLiveLastSyncedAt?.toISOString() ?? null,
        dataAvailability: {
          events: hasEvents ? 'present' : facts ? 'partial' : 'missing',
          teamStats: hasStats ? 'present' : facts ? 'partial' : 'missing',
          playerStats:
            playerRows.length > 0 ? 'present'
            : facts ? 'partial'
            : 'missing',
          spatial: spatial?.availability === 'present' ? 'present' : 'missing',
          possessionTimeline:
            possessionTimeline.length > 0 ? 'present' : 'missing',
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
    if (hit && hit.schema === MATCH_LIVE_SCHEMA_V2) return hit;
    return this.build(matchId);
  }
}
