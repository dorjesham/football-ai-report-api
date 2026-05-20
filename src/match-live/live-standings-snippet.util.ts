import { competitionIdToCode } from '../leagues/league-code.constants';
import type { PrismaService } from '../prisma/prisma.service';

export type StandingsSnippet = {
  competitionCode: string | null;
  seasonYear: number;
  home: { rank: number; points: number; played: number; teamName: string } | null;
  away: { rank: number; points: number; played: number; teamName: string } | null;
  top: Array<{ rank: number; teamName: string; points: number }>;
};

export async function buildStandingsSnippet(
  prisma: PrismaService,
  args: {
    competitionId: string;
    homeTeamId: string;
    awayTeamId: string;
    kickoffTime: Date;
  },
): Promise<StandingsSnippet | null> {
  const code = competitionIdToCode(args.competitionId);
  if (!code) return null;
  const seasonYear =
    code === 'WC' ? 2026 : args.kickoffTime.getUTCFullYear();

  const rows = await prisma.competitionStanding.findMany({
    where: { competitionId: args.competitionId, seasonYear },
    orderBy: { rank: 'asc' },
    take: 20,
    include: { team: { select: { id: true, nameCn: true } } },
  });

  if (rows.length === 0) return null;

  const findTeam = (teamId: string) => {
    const r = rows.find((x) => x.teamId === teamId);
    if (!r) return null;
    return {
      rank: r.rank,
      points: r.points ?? 0,
      played: r.played ?? 0,
      teamName: r.team.nameCn,
    };
  };

  return {
    competitionCode: code,
    seasonYear,
    home: findTeam(args.homeTeamId),
    away: findTeam(args.awayTeamId),
    top: rows.slice(0, 5).map((r) => ({
      rank: r.rank,
      teamName: r.team.nameCn,
      points: r.points ?? 0,
    })),
  };
}
