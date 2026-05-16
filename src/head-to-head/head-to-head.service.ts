import { Injectable, NotFoundException } from '@nestjs/common';
import { DataQuality, DataSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HeadToHeadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 手工录入历史交锋摘要（不编造未提供的统计字段）。
   * Body: matchId, lastMeetingsCount?, homeWins?, draws?, awayWins?, avgGoals?, summary?, missingFields?（string[]）
   */
  async importManual(matchId: string, payload: Record<string, unknown>) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    const lastMeetingsCount = Math.max(
      0,
      Math.min(50, Number(payload.lastMeetingsCount ?? payload['last-meetings']) || 0),
    );
    const homeWins = Math.max(0, Math.min(50, Number(payload.homeWins ?? payload['home-wins']) || 0));
    const draws = Math.max(0, Math.min(50, Number(payload.draws) || 0));
    const awayWins = Math.max(0, Math.min(50, Number(payload.awayWins ?? payload['away-wins']) || 0));
    const avgGoals =
      payload.avgGoals != null && payload.avgGoals !== '' ?
        Number(payload.avgGoals)
      : null;
    const summary =
      typeof payload.summary === 'string' && payload.summary.trim() ?
        payload.summary.trim()
      : `手工录入：${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}。近 ${lastMeetingsCount} 次交手（胜/平/负 ${homeWins}/${draws}/${awayWins}）。`;
    const missingFields = Array.isArray(payload.missingFields)
      ? (payload.missingFields as unknown[]).map((x) => String(x))
      : ['角球', 'xG', '红黄牌'];

    return this.prisma.headToHeadInsight.upsert({
      where: { matchId },
      create: {
        matchId,
        lastMeetingsCount: lastMeetingsCount || null,
        homeWins: homeWins || null,
        draws: draws || null,
        awayWins: awayWins || null,
        avgGoals: avgGoals != null && Number.isFinite(avgGoals) ? avgGoals : null,
        summary,
        missingFields,
        dataQuality: DataQuality.MANUAL_INPUT,
        dataSource: DataSourceType.MANUAL,
      },
      update: {
        lastMeetingsCount: lastMeetingsCount || null,
        homeWins: homeWins || null,
        draws: draws || null,
        awayWins: awayWins || null,
        avgGoals: avgGoals != null && Number.isFinite(avgGoals) ? avgGoals : null,
        summary,
        missingFields,
        dataQuality: DataQuality.MANUAL_INPUT,
        dataSource: DataSourceType.MANUAL,
      },
    });
  }

  async generate(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    return this.prisma.headToHeadInsight.upsert({
      where: { matchId },
      create: {
        matchId,
        lastMeetingsCount: 0,
        homeWins: 0,
        draws: 0,
        awayWins: 0,
        avgGoals: null,
        summary: `暂无足够结构化历史交锋数据。${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}。`,
        missingFields: ['角球', 'xG', '红黄牌'],
        dataQuality: DataQuality.PUBLIC_DATA,
        dataSource: DataSourceType.UNKNOWN,
      },
      update: {
        summary: `暂无足够结构化历史交锋数据。${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}。`,
      },
    });
  }

  get(matchId: string) {
    return this.prisma.headToHeadInsight.findUnique({ where: { matchId } });
  }

  /** Kaggle 占位：写入 IngestJobRun；若带 matchId 可在后续版本写入 HeadToHeadInsight */
  async kaggleHeadToHeadPlaceholder(meta: Record<string, unknown>) {
    const row = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'KAGGLE_H2H_PLACEHOLDER',
        status: 'SUCCEEDED',
        params: meta as object,
        resultSummary: {
          message: '预留：Kaggle 历史对阵 CSV 解析后写入 HeadToHeadInsight',
        } as object,
        finishedAt: new Date(),
      },
    });
    return { ok: true, jobId: row.id, kind: row.kind };
  }
}
