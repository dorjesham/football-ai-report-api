import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PlayerRankingMetric = 'powerRating' | 'fantasyPrice' | 'fbrefMinutes';

@Injectable()
export class RankingsService {
  constructor(private readonly prisma: PrismaService) {}

  async playerRanking(opts: {
    competitionId?: string;
    metric: PlayerRankingMetric;
    limit: number;
  }) {
    const take = Math.min(Math.max(opts.limit, 1), 100);
    let teamIds: string[] | undefined;
    if (opts.competitionId?.trim()) {
      const matches = await this.prisma.match.findMany({
        where: { competitionId: opts.competitionId.trim() },
        select: { homeTeamId: true, awayTeamId: true },
      });
      const s = new Set<string>();
      for (const m of matches) {
        s.add(m.homeTeamId);
        s.add(m.awayTeamId);
      }
      teamIds = [...s];
    }
    const orderBy =
      opts.metric === 'powerRating' ? { powerRating: 'desc' as const }
      : opts.metric === 'fantasyPrice' ? { fantasyPrice: 'desc' as const }
      : { fbrefMinutes: 'desc' as const };

    const rows = await this.prisma.player.findMany({
      where: {
        ...(teamIds?.length ? { teamId: { in: teamIds } } : {}),
        [opts.metric]: { not: null },
      },
      orderBy,
      take,
      include: {
        team: { select: { id: true, nameCn: true, nameEn: true, logoUrl: true } },
      },
    });
    return {
      metric: opts.metric,
      competitionId: opts.competitionId ?? null,
      items: rows.map((p) => ({
        id: p.id,
        nameCn: p.nameCn,
        nameEn: p.nameEn,
        position: p.position,
        shirtNumber: p.shirtNumber,
        nationality: p.nationality,
        avatarUrl: p.avatarUrl,
        powerRating: p.powerRating,
        fantasyPrice: p.fantasyPrice,
        fbrefMinutes: p.fbrefMinutes,
        team: p.team,
      })),
    };
  }
}
