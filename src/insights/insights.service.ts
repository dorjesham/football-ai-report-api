import { Injectable } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsetSignals(opts: { from?: Date; to?: Date; limit: number; minUpset: number }) {
    const take = Math.min(Math.max(opts.limit, 1), 50);
    const now = new Date();
    const from = opts.from ?? new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    const to = opts.to ?? new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    const rows = await this.prisma.match.findMany({
      where: {
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        kickoffTime: { gte: from, lte: to },
        activePrediction: { upsetIndex: { gte: opts.minUpset } },
      },
      take: Math.min(take * 4, 200),
      include: {
        activePrediction: true,
        homeTeam: { select: { id: true, nameCn: true, shortName: true, logoUrl: true } },
        awayTeam: { select: { id: true, nameCn: true, shortName: true, logoUrl: true } },
        competition: { select: { id: true, nameCn: true, code: true } },
      },
    });
    rows.sort(
      (a, b) =>
        (b.activePrediction?.upsetIndex ?? 0) - (a.activePrediction?.upsetIndex ?? 0),
    );
    const top = rows.slice(0, take);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      minUpset: opts.minUpset,
      items: top.map((m) => ({
        matchId: m.id,
        kickoffTime: m.kickoffTime.toISOString(),
        status: m.status,
        upsetIndex: m.activePrediction?.upsetIndex ?? null,
        homeWinProbability: m.activePrediction?.homeWinProbability ?? null,
        awayWinProbability: m.activePrediction?.awayWinProbability ?? null,
        summary:
          m.activePrediction?.explanation?.slice(0, 200) ||
          `主队 ${m.homeTeam.nameCn} vs ${m.awayTeam.nameCn}，冷门指数 ${m.activePrediction?.upsetIndex ?? 0}`,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        competition: m.competition,
      })),
    };
  }
}
