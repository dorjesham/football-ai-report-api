import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DataSourceType, MatchStatus } from '@prisma/client';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { MatchAfFactsSyncService } from '../api-football/match-af-facts-sync.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import { MatchOddsSnapshotService } from '../api-football/match-odds-snapshot.service';
import { PrismaService } from '../prisma/prisma.service';
import { FOOTBALL_DATA_COMPETITION_CODES } from '../common/constants/competition.constant';
import { resolveFdTeamNameCn } from '../common/constants/football-data-team-name-cn';
import { syncMatchIntelFromFootballData } from './match-fd-intel-sync';
import { LIVE_LONG_FOR_SYNC_PRIORITY_MINUTES } from '../matches/match-status-clock.util';

@Injectable()
export class FootballDataService {
  private readonly logger = new Logger(FootballDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly apiFootballIngest: ApiFootballIngestService,
    private readonly matchAfFacts: MatchAfFactsSyncService,
    private readonly preMatchSnapshots: MatchAfPreMatchSnapshotService,
    private readonly oddsSnapshots: MatchOddsSnapshotService,
  ) {}

  async syncMatchPreMatchSnapshotsFromApiFootball(
    matchId: string,
    opts?: { force?: boolean; phase?: 'T24' | 'T1' },
  ) {
    return this.preMatchSnapshots.syncByMatchId(matchId, {
      delayMs: 400,
      force: opts?.force !== false,
      phase: opts?.phase,
    });
  }

  async captureMatchOddsSnapshot(
    matchId: string,
    phase: 'T24' | 'T1' | 'LIVE',
    opts?: { force?: boolean },
  ) {
    return this.oddsSnapshots.captureByMatchId(matchId, phase, opts);
  }

  private client() {
    const key = this.config.get<string>('footballDataApiKey');
    if (!key) {
      throw new BadRequestException('FOOTBALL_DATA_API_KEY missing');
    }
    const baseURL = this.config.get<string>('footballDataBaseUrl');
    return axios.create({
      baseURL,
      timeout: 20000,
      headers: { 'X-Auth-Token': key },
    });
  }

  private async log(
    provider: string,
    endpoint: string,
    method: string,
    statusCode: number | null,
    success: boolean,
    message?: string,
  ) {
    await this.prisma.apiLog.create({
      data: {
        provider,
        endpoint,
        method,
        statusCode: statusCode ?? undefined,
        success,
        message,
      },
    });
  }

  async syncCompetitions() {
    try {
      const http = this.client();
      const { data, status } = await http.get('/competitions');
      await this.log('football-data', '/competitions', 'GET', status, true);
      const list = (data as { competitions?: unknown[] }).competitions ?? [];
      return { count: list.length };
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? e : null;
      const status = ax ? ax.response?.status ?? null : null;
      const msg = ax ? ax.response?.data?.message || ax.message : String(e);
      await this.log('football-data', '/competitions', 'GET', status, false, String(msg));
      throw new BadRequestException(`football-data sync failed: ${msg}`);
    }
  }

  /** football-data 比赛状态 → Prisma（TIMED/scheduled 类均视为未开赛） */
  private mapFdMatchStatus(raw: string | undefined): MatchStatus {
    switch ((raw || '').toUpperCase()) {
      case 'FINISHED':
        return MatchStatus.FINISHED;
      case 'LIVE':
      case 'IN_PLAY':
      case 'PAUSED':
        return MatchStatus.LIVE;
      case 'POSTPONED':
        return MatchStatus.POSTPONED;
      case 'CANCELLED':
      case 'SUSPENDED':
        return MatchStatus.CANCELLED;
      default:
        return MatchStatus.SCHEDULED;
    }
  }

  async syncMatchesByCode(code: string) {
    if (!FOOTBALL_DATA_COMPETITION_CODES.includes(code as (typeof FOOTBALL_DATA_COMPETITION_CODES)[number])) {
      await this.log('football-data', `/competitions/${code}/matches`, 'GET', null, false, 'unsupported code');
      throw new BadRequestException(
        `赛事 code 不在第一阶段支持列表，或免费 API 不可用: ${code}`,
      );
    }
    try {
      const http = this.client();
      const from = new Date();
      const to = new Date(from.getTime() + 45 * 86400000);
      const { data, status } = await http.get(`/competitions/${code}/matches`, {
        params: {
          status: 'SCHEDULED',
          limit: 99,
          dateFrom: from.toISOString().slice(0, 10),
          dateTo: to.toISOString().slice(0, 10),
        },
      });
      await this.log('football-data', `/competitions/${code}/matches`, 'GET', status, true);

      const compExternalId = String(data.competition?.id ?? '');
      const tournamentCodeMap: Record<string, string> = {
        PL: 'PL',
        PD: 'PD',
        SA: 'SA',
        BL1: 'BL1',
        FL1: 'FL1',
        CL: 'UEFA_CL',
        WC: 'FIFA_WC',
      };
      const tCode = tournamentCodeMap[code] || 'PL';
      const tournament = await this.prisma.tournament.findUnique({ where: { code: tCode } });
      if (!tournament) {
        return { message: '请先执行 seed / POST /admin/tournaments/seed-default', raw: data };
      }

      const season = await this.prisma.season.findFirst({ where: { isCurrent: true } });
      let competition = await this.prisma.competition.findFirst({
        where: { externalId: compExternalId },
      });
      if (!competition) {
        competition = await this.prisma.competition.create({
          data: {
            tournamentId: tournament.id,
            seasonId: season?.id,
            externalId: compExternalId,
            code,
            nameCn: data.competition?.name || code,
            nameEn: data.competition?.name || code,
            dataSource: DataSourceType.FOOTBALL_DATA,
          },
        });
      }

      type FdTeamLite = {
        id?: number;
        name?: string;
        shortName?: string;
        crest?: string;
      };
      const teamById = new Map<number, FdTeamLite>();
      try {
        const teamsRes = await http.get(`/competitions/${code}/teams`);
        const list = (teamsRes.data as { teams?: FdTeamLite[] }).teams ?? [];
        for (const t of list) {
          if (t.id != null) teamById.set(t.id, t);
        }
      } catch {
        /* 无球队列表时仍用赛程里的精简字段 */
      }

      const mergeTeam = (t: FdTeamLite | null | undefined): FdTeamLite | null | undefined => {
        if (!t || t.id == null) return t;
        return teamById.get(t.id) ?? t;
      };

      let n = 0;
      for (const m of data.matches || []) {
        const utc = m.utcDate ? new Date(String(m.utcDate)) : null;
        if (!utc || Number.isNaN(utc.getTime())) {
          continue;
        }
        const home = await this.upsertTeamFromFd(mergeTeam(m.homeTeam));
        const away = await this.upsertTeamFromFd(mergeTeam(m.awayTeam));
        const st = this.mapFdMatchStatus(m.status as string | undefined);
        await this.prisma.match.upsert({
          where: { externalId: String(m.id) },
          create: {
            externalId: String(m.id),
            competitionId: competition.id,
            tournamentId: tournament.id,
            seasonId: season?.id,
            homeTeamId: home.id,
            awayTeamId: away.id,
            kickoffTime: utc,
            status: st,
            dataSource: DataSourceType.FOOTBALL_DATA,
          },
          update: {
            kickoffTime: utc,
            status: st,
            dataSource: DataSourceType.FOOTBALL_DATA,
          },
        });
        n++;
      }
      return { synced: n, competitionId: competition.id };
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? e : null;
      const status = ax ? ax.response?.status ?? null : null;
      const msg = ax
        ? JSON.stringify(ax.response?.data || ax.message)
        : String(e);
      await this.log('football-data', `/competitions/${code}/matches`, 'GET', status, false, msg);
      if (ax?.response?.status === 403) {
        throw new BadRequestException('football-data.org 拒绝访问：请检查 API Key 权限或该赛事是否在免费计划中');
      }
      throw new BadRequestException(`同步失败: ${msg}`);
    }
  }

  /** 队徽：优先 API crest；否则按 id 回退官方 CDN（与 /teams 列表一致）。 */
  private resolveTeamLogoUrl(team: {
    id?: number;
    crest?: string;
  }): string | null {
    const raw = typeof team.crest === 'string' ? team.crest.trim() : '';
    if (raw) {
      if (raw.startsWith('//')) return `https:${raw}`;
      return raw;
    }
    if (team.id != null) {
      return `https://crests.football-data.org/${team.id}.png`;
    }
    return null;
  }

  /** football-data.org 比赛中的球队（中文名 + crest → logoUrl）。 */
  private async upsertTeamFromFd(team: {
    id?: number;
    name?: string;
    shortName?: string;
    crest?: string;
  } | null | undefined) {
    if (team == null || team.id == null) {
      throw new BadRequestException('football-data 比赛缺少球队 id');
    }
    const externalId = String(team.id);
    const nameEn = team.name || 'Unknown';
    const shortName = team.shortName || nameEn;
    const nameCn = resolveFdTeamNameCn(externalId, nameEn);
    const logoUrl = this.resolveTeamLogoUrl(team);
    return this.prisma.team.upsert({
      where: { externalId },
      create: {
        externalId,
        nameCn,
        nameEn,
        shortName,
        logoUrl,
        dataSource: DataSourceType.FOOTBALL_DATA,
      },
      update: {
        nameCn,
        nameEn,
        shortName,
        ...(logoUrl ? { logoUrl } : {}),
        dataSource: DataSourceType.FOOTBALL_DATA,
      },
    });
  }

  /** 历史回填 / 数据入库模块复用球队 upsert（与赛程同步一致）。 */
  async upsertTeamFromFdForIngest(team: {
    id?: number;
    name?: string;
    shortName?: string;
    crest?: string;
  } | null | undefined) {
    return this.upsertTeamFromFd(team);
  }

  async syncStandings(code: string) {
    try {
      const http = this.client();
      const { status } = await http.get(`/competitions/${code}/standings`);
      await this.log('football-data', `/competitions/${code}/standings`, 'GET', status, true);
      return { ok: true };
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? e : null;
      const msg = ax ? JSON.stringify(ax.response?.data || ax.message) : String(e);
      await this.log(
        'football-data',
        `/competitions/${code}/standings`,
        'GET',
        ax ? ax.response?.status ?? null : null,
        false,
        msg,
      );
      throw new BadRequestException(`同步积分榜失败: ${msg}`);
    }
  }

  /**
   * 从 football-data 拉取单场详情，更新比分/场地/裁判，并写入 Phase B 可验证 JSON
   * （联赛出牌样本、本场 statistics、本库主场同月统计、FD 大名单→lineupLaboratory）。
   * 需比赛已存在 `externalId`（由赛程同步写入）。
   */
  async syncMatchIntelFromFootballData(matchId: string) {
    const http = this.client();
    return syncMatchIntelFromFootballData(this.prisma, http, matchId);
  }

  /**
   * 单场：API-Football fixture + lineups + events + statistics → MatchFacts（须 `externalId=af-f-*`）。
   */
  async syncMatchAfFactsFromApiFootball(matchId: string, opts?: { force?: boolean }) {
    return this.matchAfFacts.syncByMatchId(matchId, {
      delayMs: 400,
      force: opts?.force !== false,
    });
  }

  /**
   * 对开球前后窗口内、仍为「未结束态」或 FD 源的比赛调用单场详情，刷新 status / 比分等。
   * 解决：`syncMatchesByCode` 仅用 `status=SCHEDULED` 列表，开赛后该场不再出现在列表中导致库内长期 SCHEDULED。
   */
  async pollRecentMatchStatusFromFd(opts?: {
    lookbackHours?: number;
    lookaheadMinutes?: number;
    maxMatches?: number;
    delayBetweenMs?: number;
  }): Promise<{ attempted: number; succeeded: number; failed: number; skipped: string }> {
    const lookbackH = opts?.lookbackHours ?? 20;
    const lookaheadMin = opts?.lookaheadMinutes ?? 30;
    const maxMatches = Math.min(40, Math.max(1, opts?.maxMatches ?? 20));
    const delayMs = Math.min(5000, Math.max(0, opts?.delayBetweenMs ?? 650));

    const now = new Date();
    const from = new Date(now.getTime() - lookbackH * 3600000);
    const to = new Date(now.getTime() + lookaheadMin * 60000);

    const rows = await this.prisma.match.findMany({
      where: {
        externalId: { not: null },
        dataSource: DataSourceType.FOOTBALL_DATA,
        kickoffTime: { gte: from, lte: to },
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
      },
      orderBy: { kickoffTime: 'asc' },
      take: maxMatches,
      select: { id: true },
    });

    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.syncMatchIntelFromFootballData(row.id);
        succeeded++;
      } catch (e) {
        failed++;
        this.logger.warn(
          `poll FD status ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    const skipped =
      rows.length === 0 ?
        'no rows in window'
      : `window ${from.toISOString()}–${to.toISOString()}`;
    return { attempted: rows.length, succeeded, failed, skipped };
  }

  /**
   * 高频：仅 `LIVE` 与「开球已过仍为 SCHEDULED」的 Football-Data 场次（与广域近窗互补）。
   */
  async pollLiveMatchStatusFromFd(opts?: {
    maxMatches?: number;
    delayBetweenMs?: number;
    staleScheduledLookbackHours?: number;
  }): Promise<{ attempted: number; succeeded: number; failed: number; skipped: string }> {
    const key = this.config.get<string>('footballDataApiKey');
    if (!key?.trim()) {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: 'no FOOTBALL_DATA_API_KEY',
      };
    }
    const maxMatches = Math.min(80, Math.max(1, opts?.maxMatches ?? 48));
    const delayMs = Math.min(2000, Math.max(0, opts?.delayBetweenMs ?? 90));
    const lookbackH = opts?.staleScheduledLookbackHours ?? 12;
    const now = new Date();
    const staleFrom = new Date(now.getTime() - lookbackH * 3600000);
    const longLiveKickoffBefore = new Date(
      now.getTime() - LIVE_LONG_FOR_SYNC_PRIORITY_MINUTES * 60_000,
    );

    const longLiveRows = await this.prisma.match.findMany({
      where: {
        externalId: { not: null },
        dataSource: DataSourceType.FOOTBALL_DATA,
        status: MatchStatus.LIVE,
        kickoffTime: { lte: longLiveKickoffBefore },
      },
      orderBy: { kickoffTime: 'asc' },
      take: maxMatches,
      select: { id: true },
    });
    const used = new Set(longLiveRows.map((r) => r.id));
    const afterLong = maxMatches - longLiveRows.length;

    const otherLiveRows =
      afterLong > 0 ?
        await this.prisma.match.findMany({
          where: {
            externalId: { not: null },
            dataSource: DataSourceType.FOOTBALL_DATA,
            status: MatchStatus.LIVE,
            id: { notIn: [...used] },
          },
          orderBy: { kickoffTime: 'asc' },
          take: afterLong,
          select: { id: true },
        })
      : [];
    for (const r of otherLiveRows) used.add(r.id);

    const remaining = maxMatches - used.size;
    const staleRows =
      remaining > 0 ?
        await this.prisma.match.findMany({
          where: {
            externalId: { not: null },
            dataSource: DataSourceType.FOOTBALL_DATA,
            status: MatchStatus.SCHEDULED,
            kickoffTime: { lt: now, gte: staleFrom },
          },
          orderBy: { kickoffTime: 'desc' },
          take: remaining,
          select: { id: true },
        })
      : [];

    const rows = [...longLiveRows, ...otherLiveRows, ...staleRows];
    const http = this.client();
    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await syncMatchIntelFromFootballData(this.prisma, http, row.id);
        succeeded++;
      } catch (e) {
        failed++;
        this.logger.warn(
          `poll live FD status ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    const skipped =
      rows.length === 0 ?
        'no live or late-scheduled FD matches'
      : `long_live=${longLiveRows.length} other_live=${otherLiveRows.length} late_sched=${staleRows.length}`;
    return { attempted: rows.length, succeeded, failed, skipped };
  }

  /**
   * 近窗比分/状态：依次执行 Football-Data 与 API-Football（`af-f-*` 场次），与 Cron 同源。
   * 受 `ENABLE_MATCH_FD_LIVE_POLL` 与 `ENABLE_CRON_SYNC` 控制（见 configuration）。
   */
  async pollRecentMatchStatusNearWindow(opts?: {
    lookbackHours?: number;
    lookaheadMinutes?: number;
    maxMatches?: number;
    delayBetweenMs?: number;
  }): Promise<{
    footballData: {
      attempted: number;
      succeeded: number;
      failed: number;
      skipped: string;
    };
    apiFootball: {
      attempted: number;
      succeeded: number;
      failed: number;
      skipped: string;
    };
  }> {
    const footballData = await this.pollRecentMatchStatusFromFd(opts);
    let apiFootball: {
      attempted: number;
      succeeded: number;
      failed: number;
      skipped: string;
    };
    try {
      apiFootball = await this.apiFootballIngest.pollRecentFixtureStatuses(opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`poll API-Football near window: ${msg}`);
      apiFootball = {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: msg,
      };
    }
    return { footballData, apiFootball };
  }

  /**
   * 赛中高频：FD + API-Football 各拉「LIVE + 迟滞 SCHEDULED」；与 `pollRecentMatchStatusNearWindow` 并存。
   */
  async pollLiveMatchStatusNearWindow(opts?: {
    maxMatches?: number;
    delayBetweenMs?: number;
    staleScheduledLookbackHours?: number;
  }): Promise<{
    footballData: {
      attempted: number;
      succeeded: number;
      failed: number;
      skipped: string;
    };
    apiFootball: {
      attempted: number;
      succeeded: number;
      failed: number;
      skipped: string;
    };
  }> {
    const footballData = await this.pollLiveMatchStatusFromFd(opts);
    let apiFootball: {
      attempted: number;
      succeeded: number;
      failed: number;
      skipped: string;
    };
    try {
      apiFootball = await this.apiFootballIngest.pollLiveFixtureStatuses(opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`poll API-Football live: ${msg}`);
      apiFootball = {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: msg,
      };
    }
    return { footballData, apiFootball };
  }

  async syncAllBasic() {
    const results: Record<string, unknown> = {};
    try {
      results.competitions = await this.syncCompetitions();
    } catch (e) {
      results.competitions = { error: String(e) };
    }
    for (const code of ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'WC'] as const) {
      try {
        results[`matches_${code}`] = await this.syncMatchesByCode(code);
      } catch (e) {
        results[`matches_${code}`] = { error: String(e) };
      }
    }
    return results;
  }
}
