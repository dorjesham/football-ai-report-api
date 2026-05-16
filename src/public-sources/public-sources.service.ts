import { Injectable, NotFoundException } from '@nestjs/common';
import { DataQuality, DataSourceType, MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fetchEspnScoreboardRecord } from './fetchers/espn-scoreboard.fetcher';
import { fetchFifaCalendarRecord } from './fetchers/fifa-calendar.fetcher';
import type { SourceRecordCreateShape } from './fetchers/source-record-shape';
import { buildUefaPortalLinkRecord } from './fetchers/uefa-portal-link.fetcher';
import { fetchWikipediaRecord } from './fetchers/wikipedia.fetcher';
import { buildWorldfootballSearchRecord } from './fetchers/worldfootball-link.fetcher';
import {
  PUBLIC_SOURCE_PHASE_HALF_WINDOW_MS,
  type PublicSourceScheduledPhase,
  isKickoffHorizonInWindow,
  isPostFinishFetchWindow,
} from './public-source-schedule.util';
import type { MatchPublicBrief } from './types/match-public-brief';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MANUAL_SAME_SOURCE_COOLDOWN_MS = 5 * 60 * 1000;

const matchIncludeForPublic = {
  homeTeam: true,
  awayTeam: true,
  competition: true,
  tournament: true,
  season: true,
} as const;

@Injectable()
export class PublicSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  private toBrief(
    match: Prisma.MatchGetPayload<{ include: typeof matchIncludeForPublic }>,
  ): MatchPublicBrief {
    return {
      id: match.id,
      kickoffTime: match.kickoffTime,
      homeTeam: {
        nameEn: match.homeTeam.nameEn,
        nameCn: match.homeTeam.nameCn,
        shortName: match.homeTeam.shortName,
      },
      awayTeam: {
        nameEn: match.awayTeam.nameEn,
        nameCn: match.awayTeam.nameCn,
        shortName: match.awayTeam.shortName,
      },
      competition: match.competition
        ? {
            code: match.competition.code,
            nameEn: match.competition.nameEn,
            nameCn: match.competition.nameCn,
          }
        : null,
      tournament: match.tournament
        ? { code: match.tournament.code, nameEn: match.tournament.nameEn }
        : null,
      season: match.season
        ? { year: match.season.year, code: match.season.code }
        : null,
    };
  }

  private phaseUpdateField(
    phase: PublicSourceScheduledPhase,
  ): keyof Pick<
    Prisma.MatchUpdateInput,
    | 'publicSourcesPhase48At'
    | 'publicSourcesPhase8At'
    | 'publicSourcesPhase2At'
    | 'publicSourcesPhasePostAt'
  > {
    switch (phase) {
      case 'T48':
        return 'publicSourcesPhase48At';
      case 'T8':
        return 'publicSourcesPhase8At';
      case 'T2':
        return 'publicSourcesPhase2At';
      case 'POST':
        return 'publicSourcesPhasePostAt';
    }
  }

  private whereForScheduledPhase(
    phase: PublicSourceScheduledPhase,
    now: Date,
  ): Prisma.MatchWhereInput {
    const w = PUBLIC_SOURCE_PHASE_HALF_WINDOW_MS;
    switch (phase) {
      case 'T48': {
        const target = new Date(now.getTime() + 48 * 3600000);
        return {
          kickoffTime: {
            gte: new Date(target.getTime() - w),
            lte: new Date(target.getTime() + w),
          },
          status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
          publicSourcesPhase48At: null,
        };
      }
      case 'T8': {
        const target = new Date(now.getTime() + 8 * 3600000);
        return {
          kickoffTime: {
            gte: new Date(target.getTime() - w),
            lte: new Date(target.getTime() + w),
          },
          status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
          publicSourcesPhase8At: null,
        };
      }
      case 'T2': {
        const target = new Date(now.getTime() + 2 * 3600000);
        return {
          kickoffTime: {
            gte: new Date(target.getTime() - w),
            lte: new Date(target.getTime() + w),
          },
          status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
          publicSourcesPhase2At: null,
        };
      }
      case 'POST':
        return {
          status: MatchStatus.FINISHED,
          publicSourcesPhasePostAt: null,
          kickoffTime: { lt: now },
          OR: [
            { updatedAt: { gte: new Date(now.getTime() - 45 * 60 * 1000) } },
            {
              AND: [
                { kickoffTime: { lte: new Date(now.getTime() - 95 * 60 * 1000) } },
                { kickoffTime: { gte: new Date(now.getTime() - 150 * 60 * 1000) } },
              ],
            },
          ],
        };
    }
  }

  /** Cron：各阶段窗口内待处理的比赛 id（每阶段最多 30 条）。 */
  async listMatchIdsForScheduledPhase(
    phase: PublicSourceScheduledPhase,
    now: Date,
  ): Promise<string[]> {
    const rows = await this.prisma.match.findMany({
      where: this.whereForScheduledPhase(phase, now),
      select: { id: true },
      take: 30,
      orderBy: { kickoffTime: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  /**
   * 定时任务入口：在 T-48h / T-8h / T-2h / 完场后窗口内各跑一轮（每轮每场只处理一次，靠 phase 时间戳去重）。
   */
  async runScheduledIngestWindows(now = new Date()): Promise<{
    processed: Array<{ phase: PublicSourceScheduledPhase; matchId: string; ok: boolean }>;
  }> {
    const processed: Array<{ phase: PublicSourceScheduledPhase; matchId: string; ok: boolean }> =
      [];
    const phases: PublicSourceScheduledPhase[] = ['T48', 'T8', 'T2', 'POST'];
    for (const phase of phases) {
      const ids = await this.listMatchIdsForScheduledPhase(phase, now);
      for (const matchId of ids) {
        let ok = false;
        try {
          await this.ingestSourcesForMatch(matchId, { mode: 'scheduled', phase });
          ok = true;
        } catch {
          ok = false;
        }
        processed.push({ phase, matchId, ok });
        await pause(300);
      }
    }
    return { processed };
  }

  /**
   * 管理端：列出某杯赛实例下（可选赛季）曾出现过的主客队并集，便于先确认球队再逐场抓取（比扫整场联赛更高效）。
   */
  async listCompetitionTeamsForPublicFetch(competitionId: string, seasonId?: string) {
    const comp = await this.prisma.competition.findUnique({ where: { id: competitionId } });
    if (!comp) throw new NotFoundException('Competition not found');

    const where: Prisma.MatchWhereInput = { competitionId };
    if (seasonId) where.seasonId = seasonId;

    const rows = await this.prisma.match.findMany({
      where,
      select: { homeTeamId: true, awayTeamId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.homeTeamId);
      ids.add(r.awayTeamId);
    }
    const teams = await this.prisma.team.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { nameEn: 'asc' },
      select: { id: true, nameEn: true, nameCn: true, shortName: true },
    });

    return {
      competitionId,
      seasonId: seasonId ?? null,
      teamCount: teams.length,
      teams,
      hint: '建议先核对本列表球队英名与 ESPN roster 是否一致，再对单场执行 fetch；赛程抓取会优先用联赛 roster→队赛程缩小范围。',
    };
  }

  /** 手动拉取；`force=true` 时忽略 5 分钟内同来源冷却。 */
  async fetchForMatch(matchId: string, options?: { force?: boolean }) {
    return this.ingestSourcesForMatch(matchId, {
      mode: 'manual',
      forceManualCooldown: options?.force === true,
    });
  }

  async ingestSourcesForMatch(
    matchId: string,
    options:
      | { mode: 'manual'; forceManualCooldown?: boolean }
      | { mode: 'scheduled'; phase: PublicSourceScheduledPhase },
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: matchIncludeForPublic,
    });
    if (!match) throw new NotFoundException('Match not found');

    if (options.mode === 'scheduled') {
      const phaseDone =
        (options.phase === 'T48' && match.publicSourcesPhase48At) ||
        (options.phase === 'T8' && match.publicSourcesPhase8At) ||
        (options.phase === 'T2' && match.publicSourcesPhase2At) ||
        (options.phase === 'POST' && match.publicSourcesPhasePostAt);
      if (phaseDone) {
        return { ok: true, skipped: true as const, reason: 'phase_already_marked' };
      }

      const now = new Date();
      if (options.phase === 'POST') {
        if (!isPostFinishFetchWindow(now, match.kickoffTime, match.status, match.updatedAt)) {
          return { ok: true, skipped: true as const, reason: 'post_window_not_matched' };
        }
      } else {
        const hours = options.phase === 'T48' ? 48 : options.phase === 'T8' ? 8 : 2;
        if (!isKickoffHorizonInWindow(now, match.kickoffTime, hours)) {
          return { ok: true, skipped: true as const, reason: 'horizon_mismatch' };
        }
      }
    }

    const title = `${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}`;
    const brief = this.toBrief(match);

    let skipTypes = new Set<DataSourceType>();
    if (options.mode === 'manual' && !options.forceManualCooldown) {
      const recent = await this.prisma.sourceRecord.findMany({
        where: {
          matchId,
          fetchedAt: { gte: new Date(Date.now() - MANUAL_SAME_SOURCE_COOLDOWN_MS) },
        },
        select: { sourceType: true },
      });
      skipTypes = new Set(recent.map((r) => r.sourceType));
    }

    const rows: SourceRecordCreateShape[] = [];

    if (!skipTypes.has(DataSourceType.WIKIPEDIA)) {
      rows.push(await fetchWikipediaRecord(brief, title));
      await pause(200);
    }

    if (!skipTypes.has(DataSourceType.ESPN)) {
      rows.push(await fetchEspnScoreboardRecord(brief, title));
      await pause(200);
    }

    if (!skipTypes.has(DataSourceType.FIFA)) {
      rows.push(await fetchFifaCalendarRecord(brief, title));
      await pause(200);
    }

    if (!skipTypes.has(DataSourceType.UEFA)) {
      const uefa = buildUefaPortalLinkRecord(brief, title);
      if (uefa) {
        rows.push(uefa);
        await pause(200);
      }
    }

    if (!skipTypes.has(DataSourceType.WORLDFOOTBALL)) {
      rows.push(buildWorldfootballSearchRecord(brief, title));
    }

    for (const data of rows) {
      await this.prisma.sourceRecord.create({ data });
    }

    if (options.mode === 'scheduled') {
      const field = this.phaseUpdateField(options.phase);
      await this.prisma.match.update({
        where: { id: matchId },
        data: { [field]: new Date() },
      });
    }

    return {
      ok: true,
      title,
      skipped: false as const,
      sources: rows.map((r) => ({ type: r.sourceType, name: r.sourceName })),
      mode: options.mode,
      phase: options.mode === 'scheduled' ? options.phase : undefined,
    };
  }

  async listForMatch(matchId: string) {
    return this.prisma.sourceRecord.findMany({
      where: { matchId },
      orderBy: { fetchedAt: 'desc' },
    });
  }

  async manual(
    matchId: string,
    body: { title?: string; content?: string; sourceUrl?: string },
  ) {
    await this.prisma.sourceRecord.create({
      data: {
        matchId,
        entityType: 'MATCH',
        entityId: matchId,
        sourceType: DataSourceType.MANUAL,
        sourceName: 'Manual',
        sourceUrl: body.sourceUrl,
        title: body.title || 'Manual note',
        content: body.content || '',
        dataQuality: DataQuality.MANUAL_INPUT,
      },
    });
    return { ok: true };
  }

  /** Kaggle 历史数据导入占位：写入 IngestJobRun 审计，便于后续接 CSV 管线 */
  async kagglePlaceholderJob(meta?: Record<string, unknown>) {
    const row = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'KAGGLE_IMPORT_PLACEHOLDER',
        status: 'SUCCEEDED',
        params: (meta ?? {}) as object,
        resultSummary: {
          message: '预留：可扩展为 CSV 解析后写入 HeadToHead / MatchFacts',
        } as object,
        finishedAt: new Date(),
      },
    });
    return { ok: true, jobId: row.id, kind: row.kind };
  }
}
