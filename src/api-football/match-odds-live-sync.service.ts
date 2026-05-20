import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSourceType, MatchStatus, Prisma } from '@prisma/client';
import {
  ODDS_DISCLAIMER,
  shrinkOddsMarkets,
} from './af-pre-match-mapper.util';
import { parseAfFixtureIdFromExternalId } from './af-fixture-match-fields.util';
import { ApiFootballService } from './api-football.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { shrinkJsonForWcProfile } from '../common/utils/wc2026-af-heritage-zh.util';

@Injectable()
export class MatchOddsLiveSyncService {
  private readonly log = new Logger(MatchOddsLiveSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async syncOddsMetaIfStale() {
    const kinds = [
      { kind: 'bookmakers', fn: () => this.api.getOddsBookmakers() },
      { kind: 'bets', fn: () => this.api.getOddsBets() },
    ] as const;
    for (const { kind, fn } of kinds) {
      const existing = await this.prisma.afOddsMetaCache.findUnique({ where: { kind } });
      const stale =
        !existing || Date.now() - existing.updatedAt.getTime() > 7 * 86400_000;
      if (!stale) continue;
      try {
        const pack = await fn();
        await this.prisma.afOddsMetaCache.upsert({
          where: { kind },
          create: {
            kind,
            payloadJson: pack.response as Prisma.InputJsonValue,
          },
          update: {
            payloadJson: pack.response as Prisma.InputJsonValue,
          },
        });
      } catch (e) {
        this.log.warn(`odds meta ${kind}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  async captureLiveOddsForMatch(matchId: string) {
    if (this.config.get<boolean>('enableAfOddsLiveSync') !== true) {
      return { skipped: true, reason: 'ENABLE_AF_ODDS_LIVE_SYNC=false' };
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, externalId: true, status: true },
    });
    if (!match?.externalId?.startsWith('af-f-')) {
      return { skipped: true, reason: 'non af-f-*' };
    }
    if (match.status !== MatchStatus.LIVE) {
      return { skipped: true, reason: 'not LIVE' };
    }

    const fixtureId = parseAfFixtureIdFromExternalId(match.externalId);
    if (fixtureId == null) return { skipped: true, reason: 'bad fixture id' };

    const pack = await this.api.getOddsLive(fixtureId);
    const marketsJson = shrinkOddsMarkets(pack.raw);
    const rawOdds = shrinkJsonForWcProfile(pack.raw, 18_000);
    const now = new Date();

    await this.prisma.matchOddsLiveSnapshot.create({
      data: {
        matchId,
        apiFootballFixtureId: fixtureId,
        provider: DataSourceType.API_FOOTBALL,
        capturedAt: now,
        marketsJson: marketsJson as Prisma.InputJsonValue,
        rawOdds: rawOdds as Prisma.InputJsonValue,
      },
    });

    const max = this.config.get<number>('afOddsLiveMaxSnapshotsPerMatch') ?? 120;
    const old = await this.prisma.matchOddsLiveSnapshot.findMany({
      where: { matchId },
      orderBy: { capturedAt: 'desc' },
      skip: max,
      select: { id: true },
    });
    if (old.length > 0) {
      await this.prisma.matchOddsLiveSnapshot.deleteMany({
        where: { id: { in: old.map((r) => r.id) } },
      });
    }

    this.metrics.recordOddsLiveSync(true);
    return { matchId, fixtureId, rows: pack.response.length, disclaimer: ODDS_DISCLAIMER };
  }

  async syncLiveOddsWindow(): Promise<{ attempted: number; ok: number }> {
    const leagues = this.config.get<number[]>('afOddsLiveLeagues') ?? [];
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.LIVE,
        externalId: { startsWith: 'af-f-' },
        ...(leagues.length ?
          {
            competition: {
              apiSportsLeagueId: { in: leagues },
            },
          }
        : {}),
      },
      take: 15,
      select: { id: true },
    });
    let ok = 0;
    for (const m of matches) {
      try {
        await this.captureLiveOddsForMatch(m.id);
        ok++;
      } catch (e) {
        this.log.warn(`live odds ${m.id}: ${String(e).slice(0, 80)}`);
      }
    }
    return { attempted: matches.length, ok };
  }
}
