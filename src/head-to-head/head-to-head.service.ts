import { Injectable, NotFoundException } from '@nestjs/common';
import { DataQuality, DataSourceType } from '@prisma/client';
import { mapHeadToHeadFixtures } from '../api-football/af-h2h.mapper';
import {
  parseAfFixtureIdFromExternalId,
  parseAfTeamIdFromExternalId,
} from '../api-football/af-fixture-match-fields.util';
import { ApiFootballService } from '../api-football/api-football.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HeadToHeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballService,
  ) {}

  /**
   * 手工录入历史交锋摘要（不编造未提供的统计字段）。
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

  /** 从 API-Football 拉取 H2H 并写入 HeadToHeadInsight */
  async syncFromApiFootball(matchId: string, opts?: { last?: number }) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true, competition: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    const homeApiId = parseAfTeamIdFromExternalId(match.homeTeam.externalId);
    const awayApiId = parseAfTeamIdFromExternalId(match.awayTeam.externalId);
    if (homeApiId == null || awayApiId == null) {
      return this.generatePlaceholder(matchId);
    }

    const pack = await this.apiFootball.getHeadToHead(
      homeApiId,
      awayApiId,
      opts?.last ?? 5,
    );
    if (!pack.response.length) {
      return this.generatePlaceholder(matchId);
    }

    const mapped = mapHeadToHeadFixtures(
      pack.response,
      homeApiId,
      match.homeTeam.nameCn,
    );
    const summary = `近 ${mapped.aggregate.lastMeetingsCount} 次交手：${match.homeTeam.nameCn} ${mapped.aggregate.homeWins} 胜 ${mapped.aggregate.draws} 平 ${mapped.aggregate.awayWins} 负（主视角）。`;

    return this.prisma.headToHeadInsight.upsert({
      where: { matchId },
      create: {
        matchId,
        lastMeetingsCount: mapped.aggregate.lastMeetingsCount,
        homeWins: mapped.aggregate.homeWins,
        draws: mapped.aggregate.draws,
        awayWins: mapped.aggregate.awayWins,
        summary,
        rawStats: { meetings: mapped.meetings } as object,
        dataQuality: DataQuality.PUBLIC_DATA,
        dataSource: DataSourceType.API_FOOTBALL,
      },
      update: {
        lastMeetingsCount: mapped.aggregate.lastMeetingsCount,
        homeWins: mapped.aggregate.homeWins,
        draws: mapped.aggregate.draws,
        awayWins: mapped.aggregate.awayWins,
        summary,
        rawStats: { meetings: mapped.meetings } as object,
        dataQuality: DataQuality.PUBLIC_DATA,
        dataSource: DataSourceType.API_FOOTBALL,
      },
    });
  }

  async generate(matchId: string) {
    const synced = await this.syncFromApiFootball(matchId).catch(() => null);
    if (synced) return synced;
    return this.generatePlaceholder(matchId);
  }

  private async generatePlaceholder(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    const fixtureId = parseAfFixtureIdFromExternalId(match.externalId);

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
        dataSource: fixtureId != null ? DataSourceType.API_FOOTBALL : DataSourceType.UNKNOWN,
      },
      update: {
        summary: `暂无足够结构化历史交锋数据。${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}。`,
      },
    });
  }

  get(matchId: string) {
    return this.prisma.headToHeadInsight.findUnique({ where: { matchId } });
  }

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
