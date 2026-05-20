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

  /** 世界杯冠军预测 v1：启发式，非投注建议 */
  async championPrediction(competitionId: string) {
    const comp = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, code: true, nameCn: true },
    });
    if (!comp) {
      return { available: false as const, reason: 'competition_not_found' };
    }
    const teams = await this.prisma.team.findMany({
      where: {
        OR: [
          { externalId: { startsWith: 'af-t-' } },
          { homeMatches: { some: { competitionId } } },
          { awayMatches: { some: { competitionId } } },
        ],
      },
      select: {
        id: true,
        nameCn: true,
        logoUrl: true,
        powerRating: true,
        wc2026Profile: true,
      },
      take: 48,
    });
    if (teams.length < 8) {
      return {
        available: false as const,
        reason: 'insufficient_wc_teams',
        competitionId,
      };
    }
    const scored = teams
      .map((t) => ({
        teamId: t.id,
        nameCn: t.nameCn,
        logoUrl: t.logoUrl,
        score: t.powerRating ?? 50,
      }))
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 8);
    const leader = top[0];
    return {
      available: true as const,
      competitionId,
      disclaimer:
        '本内容为基于战力与种子数据的启发式展示，不构成投注建议或官方预测。',
      leader: leader
        ? {
            teamId: leader.teamId,
            nameCn: leader.nameCn,
            winProbabilityHint: Math.min(35, Math.round(12 + leader.score / 5)),
          }
        : null,
      contenders: top.map((t, i) => ({
        rank: i + 1,
        teamId: t.teamId,
        nameCn: t.nameCn,
        logoUrl: t.logoUrl,
        score: t.score,
      })),
    };
  }
}
