import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaguesStandingsService } from '../leagues/leagues-standings.service';
import { competitionIdToCode } from '../leagues/league-code.constants';

export type ScheduleDifficulty = 'easy' | 'medium' | 'hard';

@Injectable()
export class TeamsScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly standings: LeaguesStandingsService,
  ) {}

  async upcomingSchedule(teamId: string, days: number, season = 2025) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');

    const until = new Date(Date.now() + Math.min(90, Math.max(1, days)) * 86400000);
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.SCHEDULED,
        kickoffTime: { gte: new Date(), lte: until },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: {
        homeTeam: { select: { id: true, nameCn: true, logoUrl: true, externalId: true } },
        awayTeam: { select: { id: true, nameCn: true, logoUrl: true, externalId: true } },
        competition: { select: { id: true, code: true, nameCn: true } },
      },
      orderBy: { kickoffTime: 'asc' },
      take: 30,
    });

    const rankCache = new Map<string, Map<number, number>>();

    const items = [];
    for (const m of matches) {
      const isHome = m.homeTeamId === teamId;
      const opponent = isHome ? m.awayTeam : m.homeTeam;
      const code = m.competition?.code ?? competitionIdToCode(m.competitionId);
      let opponentRank: number | null = null;
      if (code) {
        if (!rankCache.has(code)) {
          try {
            const st = await this.standings.standingsForCode(code, season, 'api_football');
            const map = new Map<number, number>();
            for (const row of st.rows) {
              if (row.teamId != null) map.set(Number(row.teamId), row.rank);
            }
            rankCache.set(code, map);
          } catch {
            rankCache.set(code, new Map());
          }
        }
        const apiId = this.parseAfTeamId(opponent.externalId);
        if (apiId != null) {
          opponentRank = rankCache.get(code)?.get(apiId) ?? null;
        }
      }
      const difficultyScore =
        opponentRank == null ? 50
        : opponentRank <= 6 ? 75
        : opponentRank <= 12 ? 55
        : 35;
      const difficulty: ScheduleDifficulty =
        difficultyScore >= 65 ? 'hard'
        : difficultyScore >= 45 ? 'medium'
        : 'easy';

      items.push({
        matchId: m.id,
        kickoffTime: m.kickoffTime.toISOString(),
        side: isHome ? ('home' as const) : ('away' as const),
        opponent: {
          id: opponent.id,
          nameCn: opponent.nameCn,
          logoUrl: opponent.logoUrl,
        },
        competition: m.competition,
        opponentRank,
        difficultyScore,
        difficulty,
      });
    }

    return { teamId, days, season, items };
  }

  private parseAfTeamId(externalId: string | null): number | null {
    if (!externalId?.startsWith('af-t-')) return null;
    const n = Number(externalId.slice('af-t-'.length));
    return Number.isFinite(n) ? n : null;
  }
}
