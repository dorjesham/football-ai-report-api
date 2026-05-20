import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  extractAfLiveClock,
  parseAfFixtureIdFromExternalId,
} from './af-fixture-match-fields.util';
import { appendLiveStatsTimelinePoint } from '../match-live/live-stats-timeline.util';
import { ApiFootballService } from './api-football.service';
import {
  isMatchInLiveFactsWindow,
  needsAfLiveFactsSync,
} from './match-af-facts-sync.util';
import { normalizeAfEvents } from '../match-live/af-events-normalizer.util';
import { mergeEventsIntoStorage } from '../match-live/match-events-storage.util';
import type { LiveMetaJson } from '../match-live/live-event.types';

export type MatchAfFactsLiveSyncResult = {
  fixtureId: number;
  detail: Record<string, unknown>;
};

@Injectable()
export class MatchAfFactsLiveSyncService {
  private readonly log = new Logger(MatchAfFactsLiveSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
  ) {}

  async syncLiveByMatchId(
    matchId: string,
    opts?: { delayMs?: number; force?: boolean; minIntervalSec?: number },
  ): Promise<MatchAfFactsLiveSyncResult> {
    const delay = Math.min(10_000, Math.max(0, opts?.delayMs ?? 350));

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { externalId: true } },
        awayTeam: { select: { externalId: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const fid = parseAfFixtureIdFromExternalId(match.externalId);
    if (fid == null) {
      throw new BadRequestException('Match is not af-f-* API-Football chain');
    }

    if (!isMatchInLiveFactsWindow(match)) {
      return {
        fixtureId: fid,
        detail: { skipped: true, reason: 'not in live window' },
      };
    }

    const existingFacts = await this.prisma.matchFacts.findUnique({
      where: { matchId },
    });

    const skipCheck = needsAfLiveFactsSync(match, existingFacts, {
      force: opts?.force,
      minIntervalSec: opts?.minIntervalSec,
    });
    if (!skipCheck.needed) {
      return {
        fixtureId: fid,
        detail: { skipped: true, reason: skipCheck.reason },
      };
    }

    const started = Date.now();
    if (delay > 0) await this.api.sleep(delay);
    const fixturePack = await this.api.getFixtureById(fid);
    const clock = extractAfLiveClock(fixturePack.item);
    if (delay > 0) await this.api.sleep(delay);
    const ev = await this.api.getFixtureEvents(fid);
    if (delay > 0) await this.api.sleep(delay);
    const stats = await this.api.getFixtureStatistics(fid);

    const homeAfId = parseTeamAfId(match.homeTeam.externalId);
    const awayAfId = parseTeamAfId(match.awayTeam.externalId);
    const normalized = normalizeAfEvents(ev.response, {
      homeTeamId: homeAfId,
      awayTeamId: awayAfId,
    });
    const eventsStorage = mergeEventsIntoStorage(
      existingFacts?.events,
      normalized,
    );

    const prevMeta = (existingFacts?.liveMetaJson ?? {}) as LiveMetaJson;
    const seq = (prevMeta.seq ?? 0) + 1;
    const now = new Date();
    const liveMeta: LiveMetaJson = {
      ...prevMeta,
      seq,
      lastPublishAt: now.toISOString(),
      clock,
    };

    const teamStatsPayload = {
      schema: 'team-stats-v1',
      apiFootball: { response: stats.response },
      footballData: (existingFacts?.teamStats as { footballData?: unknown } | null)
        ?.footballData,
    };

    const timelineJson = appendLiveStatsTimelinePoint(
      existingFacts?.liveStatsTimelineJson,
      clock.elapsed,
      teamStatsPayload,
    );

    await this.prisma.matchFacts.upsert({
      where: { matchId },
      create: {
        matchId,
        events: eventsStorage as unknown as Prisma.InputJsonValue,
        teamStats: teamStatsPayload as Prisma.InputJsonValue,
        liveMetaJson: liveMeta as Prisma.InputJsonValue,
        liveStatsTimelineJson: timelineJson as Prisma.InputJsonValue,
        minuteRegulation: clock.elapsed ?? undefined,
        afLiveLastSyncedAt: now,
        afLastSyncedAt: now,
        primaryProvider: DataSourceType.API_FOOTBALL,
        lastSyncedAt: now,
      },
      update: {
        events: eventsStorage as unknown as Prisma.InputJsonValue,
        teamStats: teamStatsPayload as Prisma.InputJsonValue,
        liveMetaJson: liveMeta as Prisma.InputJsonValue,
        liveStatsTimelineJson: timelineJson as Prisma.InputJsonValue,
        minuteRegulation: clock.elapsed ?? undefined,
        afLiveLastSyncedAt: now,
        afLastSyncedAt: now,
        lastSyncedAt: now,
      },
    });

    await this.logSync(matchId, 'af-live', Date.now() - started, true);

    return {
      fixtureId: fid,
      detail: {
        synced: true,
        eventsCount: eventsStorage.items.length,
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

function parseTeamAfId(externalId: string | null): number | null {
  if (!externalId) return null;
  const m = /^af-t-(\d+)$/.exec(externalId);
  return m ? Number(m[1]) : null;
}
