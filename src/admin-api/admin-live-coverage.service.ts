import { Injectable } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type LiveMatchCoverageRow = {
  matchId: string;
  kickoffTime: Date;
  homeTeamName: string;
  awayTeamName: string;
  competitionCode: string | null;
  externalId: string | null;
  hasEvents: boolean;
  hasTeamStats: boolean;
  hasPlayerStats: boolean;
  hasTimeline: boolean;
  lastAfSyncedAt: Date | null;
};

@Injectable()
export class AdminLiveCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async coverage(take = 30): Promise<{ items: LiveMatchCoverageRow[] }> {
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.LIVE,
        externalId: { startsWith: 'af-f-' },
      },
      orderBy: { kickoffTime: 'desc' },
      take: Math.min(50, Math.max(1, take)),
      select: {
        id: true,
        kickoffTime: true,
        externalId: true,
        homeTeam: { select: { nameCn: true } },
        awayTeam: { select: { nameCn: true } },
        competition: { select: { code: true } },
        matchFacts: {
          select: {
            events: true,
            teamStats: true,
            liveStatsTimelineJson: true,
            afLastSyncedAt: true,
          },
        },
        _count: { select: { playerMatchStats: true } },
      },
    });

    const items: LiveMatchCoverageRow[] = matches.map((m) => {
      const facts = m.matchFacts;
      const hasJson = (v: unknown) =>
        v != null &&
        (Array.isArray(v) ? v.length > 0 : typeof v === 'object');
      return {
        matchId: m.id,
        kickoffTime: m.kickoffTime,
        homeTeamName: m.homeTeam.nameCn,
        awayTeamName: m.awayTeam.nameCn,
        competitionCode: m.competition?.code ?? null,
        externalId: m.externalId,
        hasEvents: hasJson(facts?.events),
        hasTeamStats: hasJson(facts?.teamStats),
        hasPlayerStats: m._count.playerMatchStats > 0,
        hasTimeline: hasJson(facts?.liveStatsTimelineJson),
        lastAfSyncedAt: facts?.afLastSyncedAt ?? null,
      };
    });

    return { items };
  }
}
