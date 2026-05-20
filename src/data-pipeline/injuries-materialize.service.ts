import { Injectable, Logger } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballService } from '../api-football/api-football.service';
import {
  normalizeInjuriesResponse,
  splitInjuriesBySide,
} from '../matches/af-injuries.mapper';

@Injectable()
export class InjuriesMaterializeService {
  private readonly log = new Logger(InjuriesMaterializeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballService,
  ) {}

  async syncUpcomingWindow(opts?: { lookaheadHours?: number; maxMatches?: number }) {
    const lookahead = opts?.lookaheadHours ?? 72;
    const max = opts?.maxMatches ?? 40;
    const until = new Date(Date.now() + lookahead * 3600_000);
    const matches = await this.prisma.match.findMany({
      where: {
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        kickoffTime: { lte: until, gte: new Date() },
        externalId: { startsWith: 'af-f-' },
      },
      include: {
        homeTeam: { select: { externalId: true } },
        awayTeam: { select: { externalId: true } },
      },
      orderBy: { kickoffTime: 'asc' },
      take: max,
    });
    let updated = 0;
    let skipped = 0;
    for (const m of matches) {
      const fid = this.parseFixtureId(m.externalId);
      if (fid == null) {
        skipped++;
        continue;
      }
      try {
        const pack = await this.apiFootball.getInjuries({ fixture: fid });
        const homeApi = this.parseTeamId(m.homeTeam.externalId);
        const awayApi = this.parseTeamId(m.awayTeam.externalId);
        const normalized = normalizeInjuriesResponse(pack.response);
        const { homeInjuries, awayInjuries } = splitInjuriesBySide(
          normalized,
          homeApi,
          awayApi,
        );
        const payload = {
          homeInjuries,
          awayInjuries,
          items: [...homeInjuries, ...awayInjuries],
          syncedAt: new Date().toISOString(),
        };
        await this.prisma.matchFacts.upsert({
          where: { matchId: m.id },
          create: {
            matchId: m.id,
            injuriesJson: payload,
            primaryProvider: 'API_FOOTBALL',
          },
          update: { injuriesJson: payload },
        });
        updated++;
      } catch (e) {
        this.log.warn(`Injuries skip ${m.id}: ${String(e).slice(0, 120)}`);
        skipped++;
      }
    }
    return { attempted: matches.length, updated, skipped };
  }

  private parseFixtureId(externalId: string | null): number | null {
    if (!externalId?.startsWith('af-f-')) return null;
    const n = Number(externalId.slice('af-f-'.length));
    return Number.isFinite(n) ? n : null;
  }

  private parseTeamId(externalId: string | null): number | null {
    if (!externalId?.startsWith('af-t-')) return null;
    const n = Number(externalId.slice('af-t-'.length));
    return Number.isFinite(n) ? n : null;
  }
}
