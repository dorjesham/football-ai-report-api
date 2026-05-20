import { Injectable, Logger } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsMaterializeService } from './standings-materialize.service';
import { API_FOOTBALL_LEAGUE_IDS } from '../api-football/api-football.constants';

const PRIORITY_CODES = new Set(Object.keys(API_FOOTBALL_LEAGUE_IDS));

@Injectable()
export class LiveStandingsTickService {
  private readonly log = new Logger(LiveStandingsTickService.name);
  private lastTickAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly standings: StandingsMaterializeService,
  ) {}

  async runTick(opts?: { force?: boolean; minIntervalSec?: number }): Promise<{
    leagues: string[];
    results: Record<string, unknown>;
  }> {
    const minSec = opts?.minIntervalSec ?? 600;
    if (!opts?.force && Date.now() - this.lastTickAt < minSec * 1000) {
      return { leagues: [], results: { skipped: true, reason: 'within interval' } };
    }

    const liveMatches = await this.prisma.match.findMany({
      where: { status: MatchStatus.LIVE },
      select: {
        competition: { select: { code: true } },
        kickoffTime: true,
      },
    });

    const codes = new Set<string>();
    for (const m of liveMatches) {
      const code = m.competition?.code?.toUpperCase();
      if (code && PRIORITY_CODES.has(code)) codes.add(code);
    }

    if (codes.size === 0) {
      return { leagues: [], results: { skipped: true, reason: 'no live priority leagues' } };
    }

    const seasonYear = new Date().getUTCFullYear();
    const results: Record<string, unknown> = {};
    for (const code of codes) {
      try {
        const year = code === 'WC' ? 2026 : seasonYear;
        results[code] = await this.standings.syncCode(code, year);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`standings tick ${code}: ${msg}`);
        results[code] = { error: msg };
      }
    }

    this.lastTickAt = Date.now();
    return { leagues: [...codes], results };
  }
}
