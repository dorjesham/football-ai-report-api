import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DataSourceType, MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isMatchInLiveFactsWindow } from '../api-football/match-af-facts-sync.util';
import { syntheticGoalsFromScoreDelta } from '../match-live/fd-score-events.util';
import { mergeEventsIntoStorage } from '../match-live/match-events-storage.util';
import type { LiveMetaJson } from '../match-live/live-event.types';
import { keyMetricsFromFdTotals } from '../match-live/live-key-metrics.util';

function fdStatusToMatchStatus(raw: string | undefined): MatchStatus {
  switch ((raw || '').toUpperCase()) {
    case 'FINISHED':
      return MatchStatus.FINISHED;
    case 'LIVE':
    case 'IN_PLAY':
    case 'PAUSED':
      return MatchStatus.LIVE;
    case 'POSTPONED':
      return MatchStatus.POSTPONED;
    case 'CANCELLED':
    case 'SUSPENDED':
      return MatchStatus.CANCELLED;
    default:
      return MatchStatus.SCHEDULED;
  }
}

function readTeamStats(side: unknown): { yellow: number; red: number; fouls: number } {
  if (!side || typeof side !== 'object') return { yellow: 0, red: 0, fouls: 0 };
  const st = (side as { statistics?: Record<string, unknown> }).statistics;
  if (!st || typeof st !== 'object') return { yellow: 0, red: 0, fouls: 0 };
  const yellow = Number(st.yellow_cards ?? 0) || 0;
  const red =
    (Number(st.red_cards ?? 0) || 0) + (Number(st.yellow_red_cards ?? 0) || 0);
  const fouls = Number(st.fouls ?? 0) || 0;
  return { yellow, red, fouls };
}

export type MatchFdLiveSyncResult = {
  detail: Record<string, unknown>;
};

@Injectable()
export class MatchFdLiveSyncService {
  private readonly log = new Logger(MatchFdLiveSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private client() {
    const key = this.config.get<string>('footballDataApiKey');
    if (!key?.trim()) {
      throw new BadRequestException('FOOTBALL_DATA_API_KEY missing');
    }
    return axios.create({
      baseURL: this.config.get<string>('footballDataBaseUrl'),
      headers: { 'X-Auth-Token': key },
      timeout: 25_000,
    });
  }

  async syncLiveByMatchId(
    matchId: string,
    opts?: { force?: boolean; minIntervalSec?: number },
  ): Promise<MatchFdLiveSyncResult> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (!match.externalId || match.externalId.startsWith('af-f-')) {
      throw new BadRequestException('Match is not Football-Data chain');
    }
    if (match.dataSource !== DataSourceType.FOOTBALL_DATA) {
      throw new BadRequestException('Match dataSource is not FOOTBALL_DATA');
    }

    if (!isMatchInLiveFactsWindow(match)) {
      return { detail: { skipped: true, reason: 'not in live window' } };
    }

    const facts = await this.prisma.matchFacts.findUnique({ where: { matchId } });
    const intervalMs = Math.max(15, opts?.minIntervalSec ?? 30) * 1000;
    if (
      !opts?.force &&
      facts?.fdLiveLastSyncedAt &&
      Date.now() - facts.fdLiveLastSyncedAt.getTime() < intervalMs
    ) {
      return { detail: { skipped: true, reason: 'within min interval' } };
    }

    const started = Date.now();
    const http = this.client();
    const detail = (await http.get(`/matches/${encodeURIComponent(match.externalId)}`))
      .data as Record<string, unknown>;

    const statusStr = typeof detail.status === 'string' ? detail.status : undefined;
    const score = detail.score as
      | { fullTime?: { home?: number | null; away?: number | null } }
      | undefined;
    const homeFt = score?.fullTime?.home;
    const awayFt = score?.fullTime?.away;
    const hs = homeFt != null ? Math.trunc(homeFt) : match.homeScore;
    const as = awayFt != null ? Math.trunc(awayFt) : match.awayScore;

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: fdStatusToMatchStatus(statusStr),
        dataSource: DataSourceType.FOOTBALL_DATA,
        ...(homeFt != null || awayFt != null ?
          { homeScore: hs, awayScore: as }
        : {}),
      },
    });

    const hst = readTeamStats(detail.homeTeam);
    const ast = readTeamStats(detail.awayTeam);
    const prevMeta = (facts?.liveMetaJson ?? {}) as LiveMetaJson;
    const synthetic = syntheticGoalsFromScoreDelta({
      prevHome: prevMeta.lastHomeScore ?? match.homeScore,
      prevAway: prevMeta.lastAwayScore ?? match.awayScore,
      home: hs,
      away: as,
    });
    const eventsStorage = mergeEventsIntoStorage(facts?.events, synthetic);

    const seq = (prevMeta.seq ?? 0) + 1;
    const now = new Date();
    const liveMeta: LiveMetaJson = {
      ...prevMeta,
      seq,
      lastHomeScore: hs,
      lastAwayScore: as,
      lastPublishAt: now.toISOString(),
    };

    const existingTs = facts?.teamStats as {
      apiFootball?: unknown;
      footballData?: unknown;
    } | null;
    const teamStatsPayload = {
      schema: 'team-stats-v1',
      apiFootball: existingTs?.apiFootball,
      footballData: {
        home: hst,
        away: ast,
        keyMetrics: keyMetricsFromFdTotals({
          homeYellow: hst.yellow,
          homeRed: hst.red,
          homeFouls: hst.fouls,
          awayYellow: ast.yellow,
          awayRed: ast.red,
          awayFouls: ast.fouls,
        }),
      },
    };

    await this.prisma.matchFacts.upsert({
      where: { matchId },
      create: {
        matchId,
        events: eventsStorage as unknown as Prisma.InputJsonValue,
        teamStats: teamStatsPayload as Prisma.InputJsonValue,
        liveMetaJson: liveMeta as Prisma.InputJsonValue,
        fdLiveLastSyncedAt: now,
        lastSyncedAt: now,
        primaryProvider: DataSourceType.FOOTBALL_DATA,
      },
      update: {
        events: eventsStorage as unknown as Prisma.InputJsonValue,
        teamStats: teamStatsPayload as Prisma.InputJsonValue,
        liveMetaJson: liveMeta as Prisma.InputJsonValue,
        fdLiveLastSyncedAt: now,
        lastSyncedAt: now,
      },
    });

    await this.logSync(matchId, 'fd-live', Date.now() - started, true);

    return {
      detail: {
        synced: true,
        eventsCount: eventsStorage.items.length,
        syntheticGoals: synthetic.length,
        seq,
        durationMs: Date.now() - started,
      },
    };
  }

  private async logSync(
    matchId: string,
    endpoint: string,
    durationMs: number,
    success: boolean,
  ) {
    try {
      await this.prisma.apiLog.create({
        data: {
          provider: 'live-sync',
          endpoint,
          method: 'SYNC',
          success,
          message: `matchId=${matchId} durationMs=${durationMs}`,
        },
      });
    } catch (e) {
      this.log.warn(`apiLog: ${String(e)}`);
    }
  }
}
