import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseAfFixtureIdFromExternalId } from './af-fixture-match-fields.util';
import {
  ODDS_DISCLAIMER,
  shrinkOddsMarkets,
} from './af-pre-match-mapper.util';
import { ApiFootballService } from './api-football.service';
import { shrinkJsonForWcProfile } from '../common/utils/wc2026-af-heritage-zh.util';

export type OddsSnapshotPhase = 'T24' | 'T1' | 'LIVE';

@Injectable()
export class MatchOddsSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
  ) {}

  async captureByMatchId(
    matchId: string,
    phase: OddsSnapshotPhase,
    opts?: { force?: boolean },
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        externalId: true,
        afOddsSnapshot24At: true,
        afOddsSnapshot1At: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const fixtureId = parseAfFixtureIdFromExternalId(match.externalId);
    if (fixtureId == null) {
      throw new BadRequestException('Match.externalId 须为 af-f-{fixtureId}');
    }

    if (!opts?.force) {
      if (phase === 'T24' && match.afOddsSnapshot24At) {
        return { skipped: true, phase, fixtureId, reason: 'T24 cursor already set' };
      }
      if (phase === 'T1' && match.afOddsSnapshot1At) {
        return { skipped: true, phase, fixtureId, reason: 'T1 cursor already set' };
      }
    }

    const pack = await this.api.getOdds(fixtureId);
    const marketsJson = shrinkOddsMarkets(pack.raw);
    const rawOdds = shrinkJsonForWcProfile(pack.raw, 18_000);
    const now = new Date();

    await this.prisma.matchOddsSnapshot.upsert({
      where: {
        matchId_phase_provider: {
          matchId,
          phase,
          provider: DataSourceType.API_FOOTBALL,
        },
      },
      create: {
        matchId,
        apiFootballFixtureId: fixtureId,
        phase,
        provider: DataSourceType.API_FOOTBALL,
        capturedAt: now,
        marketsJson: marketsJson as Prisma.InputJsonValue,
        rawOdds: rawOdds as Prisma.InputJsonValue,
      },
      update: {
        apiFootballFixtureId: fixtureId,
        capturedAt: now,
        marketsJson: marketsJson as Prisma.InputJsonValue,
        rawOdds: rawOdds as Prisma.InputJsonValue,
      },
    });

    const matchUpdate: Prisma.MatchUpdateInput = {};
    if (phase === 'T24') matchUpdate.afOddsSnapshot24At = now;
    if (phase === 'T1') matchUpdate.afOddsSnapshot1At = now;
    if (Object.keys(matchUpdate).length > 0) {
      await this.prisma.match.update({ where: { id: matchId }, data: matchUpdate });
    }

    return {
      skipped: false,
      phase,
      fixtureId,
      bookmakerRows: pack.response.length,
      capturedAt: now.toISOString(),
    };
  }

  async listForMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, externalId: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    const fixtureId = parseAfFixtureIdFromExternalId(match.externalId);
    const rows = await this.prisma.matchOddsSnapshot.findMany({
      where: { matchId },
      orderBy: { capturedAt: 'desc' },
    });

    return {
      matchId,
      fixtureId,
      disclaimer: ODDS_DISCLAIMER,
      snapshots: rows.map((r) => ({
        phase: r.phase,
        provider: r.provider,
        capturedAt: r.capturedAt.toISOString(),
        markets: r.marketsJson,
      })),
    };
  }
}
