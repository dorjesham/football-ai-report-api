import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DataSourceType,
  MatchStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballService } from './api-football.service';
import { MatchAfFactsSyncService } from './match-af-facts-sync.service';
import { MatchAfPreMatchSnapshotService } from './match-af-pre-match-snapshot.service';
import { MatchOddsSnapshotService } from './match-odds-snapshot.service';
import { isKickoffHorizonInWindow } from '../public-sources/public-source-schedule.util';
import { WeatherService } from '../weather/weather.service';
import {
  API_FOOTBALL_DEFAULT_CODES,
  leagueIdForCode,
} from './api-football.constants';
import { LIVE_LONG_FOR_SYNC_PRIORITY_MINUTES } from '../matches/match-status-clock.util';
import {
  asRecord,
  extractAfFixtureMatchFields,
} from './af-fixture-match-fields.util';
import {
  buildWcHistoricalHeritageZhFromAfStats,
  shrinkJsonForWcProfile,
} from '../common/utils/wc2026-af-heritage-zh.util';

const TOURNAMENT_CODE_MAP: Record<string, string> = {
  PL: 'PL',
  PD: 'PD',
  SA: 'SA',
  BL1: 'BL1',
  FL1: 'FL1',
  CL: 'UEFA_CL',
  EL: 'UEFA_CL',
  UECL: 'UEFA_CL',
  WC: 'FIFA_WC',
};

/**
 * /teams?league=&season= 单项：常见为 `{ team: { id, name, ... }, venue: ... }`，
 * 也可能为顶层即球队对象（含 id）。
 */
/** fixtures 项里 `teams.home` / `away`：多为扁平球队，少数为 `{ team: { id, ... } }` */
function unwrapAfFixtureSideTeam(node: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!node) return null;
  const nested = asRecord(node.team);
  if (nested && Number.isFinite(Number(nested.id))) return nested;
  if (Number.isFinite(Number(node.id))) return node;
  return null;
}

function unwrapAfTeamRow(wrap: unknown): {
  apiTeamId: number;
  teamNode: Record<string, unknown>;
} | null {
  const row = asRecord(wrap);
  if (!row) return null;
  const nested = asRecord(row.team);
  if (nested && Number.isFinite(Number(nested.id))) {
    return { apiTeamId: Number(nested.id), teamNode: nested };
  }
  if (Number.isFinite(Number(row.id))) {
    return { apiTeamId: Number(row.id), teamNode: row };
  }
  return null;
}

/**
 * /players 分页单项：多为 `{ player: { id, name, ... }, statistics: [...] }`；
 * 少数情况下也可能是扁平对象（直接含 id）。
 */
function unwrapAfPlayerRow(pRaw: unknown): {
  player: Record<string, unknown>;
  envelope: Record<string, unknown>;
} | null {
  const root = asRecord(pRaw);
  if (!root) return null;
  const nested = asRecord(root.player);
  if (nested && Number.isFinite(Number(nested.id))) {
    return { player: nested, envelope: root };
  }
  if (Number.isFinite(Number(root.id))) {
    return { player: root, envelope: root };
  }
  return null;
}

function mergePlayerProfileApiFootball(
  prev: Prisma.JsonValue | null | undefined,
  season: number,
  payload: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  const af = asRecord(base.apiFootball) ?? {};
  const seasons = asRecord(af.seasons) ?? {};
  seasons[String(season)] = payload;
  base.apiFootball = { ...af, seasons };
  return base as Prisma.InputJsonValue;
}

@Injectable()
export class ApiFootballIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
    private readonly config: ConfigService,
    private readonly matchAfFacts: MatchAfFactsSyncService,
    private readonly preMatchSnapshots: MatchAfPreMatchSnapshotService,
    private readonly oddsSnapshots: MatchOddsSnapshotService,
    private readonly weather: WeatherService,
  ) {}

  private async upsertTeamFromAf(node: Record<string, unknown> | null) {
    if (!node) throw new BadRequestException('API-Football 缺少球队节点');
    const id = Number(node.id);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('API-Football 球队 id 无效');
    }
    const nameEn = String(node.name ?? 'Unknown');
    const logoRaw = typeof node.logo === 'string' ? node.logo.trim() : '';
    const logoUrl =
      logoRaw ?
        logoRaw.startsWith('//') ?
          `https:${logoRaw}`
        : logoRaw
      : null;
    const ext = `af-t-${id}`;
    return this.prisma.team.upsert({
      where: { externalId: ext },
      create: {
        externalId: ext,
        nameCn: nameEn,
        nameEn,
        shortName: nameEn.slice(0, 32),
        logoUrl,
        dataSource: DataSourceType.API_FOOTBALL,
      },
      update: {
        nameEn,
        shortName: nameEn.slice(0, 32),
        logoUrl,
        dataSource: DataSourceType.API_FOOTBALL,
      },
    });
  }

  /**
   * 同步指定联赛赛季的全部赛程（分页拉取 fixtures），写入 `Match.externalId=af-f-{fixtureId}`，
   * 主客队 `af-t-{teamId}`。免费版注意每日请求上限。
   */
  async syncFixtures(opts: {
    competitionCodes: string[];
    season: number;
    delayBetweenRequestsMs?: number;
    maxPagesPerLeague?: number;
  }): Promise<Record<string, unknown>> {
    const delay = Math.min(10_000, Math.max(0, opts.delayBetweenRequestsMs ?? 1350));
    const maxPages = Math.min(100, Math.max(1, opts.maxPagesPerLeague ?? 40));
    const codes =
      opts.competitionCodes?.length ?
        opts.competitionCodes.map((c) => c.toUpperCase())
      : [...API_FOOTBALL_DEFAULT_CODES];
    const season = opts.season;
    const summary: Record<string, unknown> = { season, leagues: {} as Record<string, unknown> };
    const seasonRow = await this.prisma.season.findFirst({
      where: { isCurrent: true },
    });

    for (const code of codes) {
      const leagueId = leagueIdForCode(code);
      if (leagueId == null) {
        (summary.leagues as Record<string, unknown>)[code] = {
          skipped: true,
          reason: 'unsupported code',
        };
        continue;
      }
      const tournament = await this.prisma.tournament.findUnique({
        where: { code: TOURNAMENT_CODE_MAP[code] || 'PL' },
      });
      if (!tournament) {
        throw new NotFoundException(`缺少 Tournament：请先 seed，code=${TOURNAMENT_CODE_MAP[code]}`);
      }
      let competition = await this.prisma.competition.findFirst({
        where: { code },
      });
      if (!competition) {
        throw new NotFoundException(`本地缺少 Competition.code=${code}，请先 seed`);
      }
      if (competition.apiSportsLeagueId !== leagueId) {
        competition = await this.prisma.competition.update({
          where: { id: competition.id },
          data: { apiSportsLeagueId: leagueId, dataSource: DataSourceType.API_FOOTBALL },
        });
      }

      let totalUpserted = 0;
      let pages = 0;
      let fixtureApiRowsTotal = 0;
      let fixturesSkippedUnparsed = 0;
      let firstPageFixtureMeta: {
        results?: number;
        errorsText?: string;
      } | null = null;
      for (let page = 1; page <= maxPages; page++) {
        const pack = await this.api.getFixturesPage({
          league: leagueId,
          season,
          page,
        });
        pages = page;
        if (page === 1) {
          firstPageFixtureMeta = {
            results: pack.results,
            errorsText: pack.errorsText,
          };
        }
        fixtureApiRowsTotal += pack.items.length;
        for (const rawItem of pack.items) {
          const item = asRecord(rawItem);
          const teams = asRecord(item?.teams);
          const home = unwrapAfFixtureSideTeam(asRecord(teams?.home));
          const away = unwrapAfFixtureSideTeam(asRecord(teams?.away));
          const fixture = asRecord(item?.fixture);
          const fid = Number(fixture?.id);
          const fields = extractAfFixtureMatchFields(rawItem);
          if (!Number.isFinite(fid) || !fields) {
            fixturesSkippedUnparsed += 1;
            continue;
          }
          if (!home || !away) {
            fixturesSkippedUnparsed += 1;
            continue;
          }
          const st = fields.status;
          const homeTeam = await this.upsertTeamFromAf(home);
          const awayTeam = await this.upsertTeamFromAf(away);
          const homeScore = fields.homeScore;
          const awayScore = fields.awayScore;
          const ext = `af-f-${fid}`;
          await this.prisma.match.upsert({
            where: { externalId: ext },
            create: {
              externalId: ext,
              competitionId: competition.id,
              tournamentId: tournament.id,
              seasonId: competition.seasonId ?? seasonRow?.id,
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              kickoffTime: fields.kickoffTime,
              status: st,
              stadium: fields.stadium,
              homeScore: st === MatchStatus.FINISHED ? homeScore : null,
              awayScore: st === MatchStatus.FINISHED ? awayScore : null,
              dataSource: DataSourceType.API_FOOTBALL,
            },
            update: {
              kickoffTime: fields.kickoffTime,
              status: st,
              stadium: fields.stadium ?? undefined,
              homeScore: st === MatchStatus.FINISHED ? homeScore : null,
              awayScore: st === MatchStatus.FINISHED ? awayScore : null,
              dataSource: DataSourceType.API_FOOTBALL,
            },
          });
          totalUpserted += 1;
        }
        if (pack.paging.current >= pack.paging.total) break;
        if (delay > 0) await this.api.sleep(delay);
      }
      (summary.leagues as Record<string, unknown>)[code] = {
        leagueId,
        fixturesUpserted: totalUpserted,
        pagesFetched: pages,
        fixtureApiRowsTotal,
        fixturesSkippedUnparsed,
        fixtureApiResults: firstPageFixtureMeta?.results,
        fixtureApiErrorsText: firstPageFixtureMeta?.errorsText,
      };
      if (delay > 0) await this.api.sleep(delay);
    }
    return summary;
  }

  /** `GET /fixtures?id=` 写回单场；成功返回 true（含解析/更新失败返回 false）。 */
  private async refreshAfFixtureRow(
    row: { id: string; externalId: string | null },
  ): Promise<boolean> {
    const ext = row.externalId ?? '';
    const m = /^af-f-(\d+)$/.exec(ext);
    const fid = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(fid)) return false;
    try {
      const prev = await this.prisma.match.findUnique({
        where: { id: row.id },
        select: { status: true },
      });
      const { item } = await this.api.getFixtureById(fid);
      const fields = extractAfFixtureMatchFields(item);
      if (!fields) {
        throw new Error('fixture response empty or unparsable');
      }
      const hs =
        fields.homeScore != null ? Math.trunc(fields.homeScore) : null;
      const as =
        fields.awayScore != null ? Math.trunc(fields.awayScore) : null;
      await this.prisma.match.update({
        where: { id: row.id },
        data: {
          kickoffTime: fields.kickoffTime,
          status: fields.status,
          homeScore: hs,
          awayScore: as,
          stadium: fields.stadium ?? undefined,
          dataSource: DataSourceType.API_FOOTBALL,
        },
      });
      if (
        prev?.status !== MatchStatus.FINISHED &&
        fields.status === MatchStatus.FINISHED
      ) {
        void this.matchAfFacts.syncByMatchId(row.id, { delayMs: 400 }).catch(() => undefined);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 定时任务：对近窗内已 FINISHED 的 `af-f-*` 场次写满 MatchFacts（增量 skip 已完整场次）。
   */
  async runScheduledAfMatchFactsEnrich(opts?: {
    lookbackDays?: number;
    maxMatches?: number;
    delayBetweenMatchesMs?: number;
    competitionId?: string;
  }): Promise<{
    attempted: number;
    succeeded: number;
    skipped: number;
    failed: number;
  }> {
    if (!this.config.get<string>('apiFootballApiKey')?.trim()) {
      return { attempted: 0, succeeded: 0, skipped: 0, failed: 0 };
    }
    const lookbackDays = Math.min(
      365,
      Math.max(1, opts?.lookbackDays ?? this.config.get<number>('afMatchFactsLookbackDays') ?? 14),
    );
    const maxM = Math.min(
      100,
      Math.max(1, opts?.maxMatches ?? this.config.get<number>('afMatchFactsMaxPerTick') ?? 20),
    );
    const delayB = Math.min(
      30_000,
      Math.max(
        0,
        opts?.delayBetweenMatchesMs ?? this.config.get<number>('afMatchFactsDelayMs') ?? 800,
      ),
    );
    const since = new Date(Date.now() - lookbackDays * 86_400_000);
    const where: Prisma.MatchWhereInput = {
      externalId: { startsWith: 'af-f-' },
      status: MatchStatus.FINISHED,
      kickoffTime: { gte: since },
    };
    if (opts?.competitionId?.trim()) {
      where.competitionId = opts.competitionId.trim();
    }

    const rows = await this.prisma.match.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { kickoffTime: 'desc' }],
      take: maxM,
      select: { id: true },
    });

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const out = await this.matchAfFacts.syncByMatchId(row.id, { delayMs: 400 });
        if (out.detail.skipped === true) {
          skipped += 1;
        } else {
          succeeded += 1;
        }
      } catch {
        failed += 1;
      }
      if (delayB > 0) {
        await this.api.sleep(delayB);
      }
    }
    return { attempted: rows.length, succeeded, skipped, failed };
  }

  /**
   * 近窗轮询：对 `externalId` 为 `af-f-{id}`、开球窗口内且仍为 SCHEDULED/LIVE 的比赛
   * 调用 `GET /fixtures?id=` 刷新状态与比分（赛中也会写入当前比分）。
   * 与 Football-Data 近窗轮询并存；未配置 `API_FOOTBALL_API_KEY` 时返回 attempted=0。
   */
  async pollRecentFixtureStatuses(opts?: {
    lookbackHours?: number;
    lookaheadMinutes?: number;
    maxMatches?: number;
    delayBetweenMs?: number;
  }): Promise<{ attempted: number; succeeded: number; failed: number; skipped: string }> {
    if (!this.config.get<string>('apiFootballApiKey')?.trim()) {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: 'no API_FOOTBALL_API_KEY',
      };
    }
    const lookbackH = opts?.lookbackHours ?? 20;
    const lookaheadMin = opts?.lookaheadMinutes ?? 30;
    const maxMatches = Math.min(40, Math.max(1, opts?.maxMatches ?? 20));
    const delayMs = Math.min(5000, Math.max(0, opts?.delayBetweenMs ?? 650));

    const now = new Date();
    const from = new Date(now.getTime() - lookbackH * 3600000);
    const to = new Date(now.getTime() + lookaheadMin * 60000);

    const rows = await this.prisma.match.findMany({
      where: {
        externalId: { startsWith: 'af-f-' },
        kickoffTime: { gte: from, lte: to },
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
      },
      orderBy: { kickoffTime: 'asc' },
      take: maxMatches,
      select: { id: true, externalId: true },
    });

    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      if (await this.refreshAfFixtureRow(row)) succeeded++;
      else failed++;
      if (delayMs > 0) {
        await this.api.sleep(delayMs);
      }
    }

    const skipped =
      rows.length === 0 ?
        'no rows in window'
      : `window ${from.toISOString()}–${to.toISOString()}`;
    return { attempted: rows.length, succeeded, failed, skipped };
  }

  /**
   * 高频轮询：仅 `LIVE` 与「开球时间已过仍为 SCHEDULED」的 `af-f-*` 场次（与广域近窗任务互补）。
   * 用于赛中比分/状态秒级～十秒级体感；仍受上游 API 延迟与配额约束。
   */
  async pollLiveFixtureStatuses(opts?: {
    maxMatches?: number;
    delayBetweenMs?: number;
    staleScheduledLookbackHours?: number;
  }): Promise<{ attempted: number; succeeded: number; failed: number; skipped: string }> {
    if (!this.config.get<string>('apiFootballApiKey')?.trim()) {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: 'no API_FOOTBALL_API_KEY',
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

    /** 开球已久仍为 LIVE：优先刷，避免终场后长期卡在「比赛中」 */
    const longLiveRows = await this.prisma.match.findMany({
      where: {
        externalId: { startsWith: 'af-f-' },
        status: MatchStatus.LIVE,
        kickoffTime: { lte: longLiveKickoffBefore },
      },
      orderBy: { kickoffTime: 'asc' },
      take: maxMatches,
      select: { id: true, externalId: true },
    });
    const used = new Set(longLiveRows.map((r) => r.id));
    const afterLong = maxMatches - longLiveRows.length;

    const otherLiveRows =
      afterLong > 0 ?
        await this.prisma.match.findMany({
          where: {
            externalId: { startsWith: 'af-f-' },
            status: MatchStatus.LIVE,
            id: { notIn: [...used] },
          },
          orderBy: { kickoffTime: 'asc' },
          take: afterLong,
          select: { id: true, externalId: true },
        })
      : [];
    for (const r of otherLiveRows) used.add(r.id);

    const remaining = maxMatches - used.size;
    const staleRows =
      remaining > 0 ?
        await this.prisma.match.findMany({
          where: {
            externalId: { startsWith: 'af-f-' },
            status: MatchStatus.SCHEDULED,
            kickoffTime: { lt: now, gte: staleFrom },
          },
          orderBy: { kickoffTime: 'desc' },
          take: remaining,
          select: { id: true, externalId: true },
        })
      : [];

    const rows = [...longLiveRows, ...otherLiveRows, ...staleRows];
    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      if (await this.refreshAfFixtureRow(row)) succeeded++;
      else failed++;
      if (delayMs > 0) {
        await this.api.sleep(delayMs);
      }
    }

    const skipped =
      rows.length === 0 ?
        'no live or late-scheduled af fixtures'
      : `long_live=${longLiveRows.length} other_live=${otherLiveRows.length} late_sched=${staleRows.length}`;
    return { attempted: rows.length, succeeded, failed, skipped };
  }

  /**
   * 按联赛拉取 `/teams` 再对每队分页 `/players`，写入 `Player.externalId=af-p-{id}`，
   * 并在 `profile.apiFootball.seasons[season]` 存原始快照字段。
   */
  async syncSquads(opts: {
    competitionCodes: string[];
    season: number;
    delayBetweenRequestsMs?: number;
    maxTeamsPerLeague?: number;
  }): Promise<Record<string, unknown>> {
    const delay = Math.min(10_000, Math.max(0, opts.delayBetweenRequestsMs ?? 2000));
    const maxTeams = Math.min(50, Math.max(1, opts.maxTeamsPerLeague ?? 24));
    const codes =
      opts.competitionCodes?.length ?
        opts.competitionCodes.map((c) => c.toUpperCase())
      : [...API_FOOTBALL_DEFAULT_CODES];
    const season = opts.season;
    const out: Record<string, unknown> = { season, leagues: {} as Record<string, unknown> };

    for (const code of codes) {
      const leagueId = leagueIdForCode(code);
      if (leagueId == null) continue;
      const teamPack = await this.api.getTeamsInLeague(leagueId, season);
      const { items, errors: teamApiErrors, results: teamApiResults } = teamPack;
      if (delay > 0) await this.api.sleep(delay);
      let playersUpserted = 0;
      let teamsProcessed = 0;
      let teamsSkippedNoFixtureRow = 0;
      let teamsUnparsedRow = 0;
      /** 库内本无 af-t-*，由本趟 /teams 名单现场 upsert 出来的球队数 */
      let teamsMaterializedFromApi = 0;
      for (const wrap of items) {
        if (teamsProcessed >= maxTeams) break;
        const unTeam = unwrapAfTeamRow(wrap);
        if (!unTeam) {
          teamsUnparsedRow += 1;
          continue;
        }
        const apiTeamId = unTeam.apiTeamId;
        let dbTeam = await this.prisma.team.findUnique({
          where: { externalId: `af-t-${apiTeamId}` },
        });
        if (!dbTeam) {
          try {
            dbTeam = await this.upsertTeamFromAf(
              unTeam.teamNode as Record<string, unknown>,
            );
            teamsMaterializedFromApi += 1;
          } catch {
            teamsSkippedNoFixtureRow += 1;
            continue;
          }
        }
        teamsProcessed += 1;
        for (let page = 1; page <= 30; page++) {
          const pack = await this.api.getPlayersPage({
            team: apiTeamId,
            season,
            page,
          });
          for (const pRaw of pack.items) {
            const un = unwrapAfPlayerRow(pRaw);
            if (!un) continue;
            const p = un.player;
            const pid = Number(p.id);
            if (!Number.isFinite(pid)) continue;
            const fn = typeof p.firstname === 'string' ? p.firstname.trim() : '';
            const ln = typeof p.lastname === 'string' ? p.lastname.trim() : '';
            const nameFromParts =
              fn || ln ? [fn, ln].filter(Boolean).join(' ').trim() : '';
            const nameEn = String(
              (typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null) ||
                nameFromParts ||
                'Unknown',
            );
            const photoRaw =
              typeof p.photo === 'string' ? p.photo.trim() : '';
            const photo =
              photoRaw ?
                photoRaw.startsWith('//') ?
                  `https:${photoRaw}`
                : photoRaw
              : null;
            const statsArr = Array.isArray(un.envelope.statistics)
              ? un.envelope.statistics
              : null;
            const st0 =
              statsArr && statsArr.length ? asRecord(statsArr[0]) : null;
            const games = st0 ? asRecord(st0.games) : null;
            const numRaw = p.number ?? games?.number;
            const shirtN = Number(numRaw);
            const shirtNumber =
              numRaw != null && numRaw !== '' && Number.isFinite(shirtN) ?
                Math.trunc(shirtN)
              : null;
            const position =
              typeof p.position === 'string' && p.position.trim() ?
                p.position.trim()
              : typeof games?.position === 'string' && String(games.position).trim() ?
                String(games.position).trim()
              : undefined;
            const extPlayerId = `af-p-${pid}`;
            const existing = await this.prisma.player.findFirst({
              where: { externalId: extPlayerId },
              select: { id: true, profile: true },
            });
            const profilePatch = mergePlayerProfileApiFootball(
              existing?.profile ?? null,
              season,
              {
                snapshot: un.envelope,
                ingestedAt: new Date().toISOString(),
              },
            );
            const baseData = {
              teamId: dbTeam.id,
              nameEn,
              nameCn: nameEn,
              position,
              nationality:
                typeof p.nationality === 'string' ? p.nationality : undefined,
              shirtNumber,
              avatarUrl: photo ?? undefined,
              profile: profilePatch,
              dataSource: DataSourceType.API_FOOTBALL,
            };
            if (existing) {
              await this.prisma.player.update({
                where: { id: existing.id },
                data: baseData,
              });
            } else {
              await this.prisma.player.create({
                data: {
                  ...baseData,
                  externalId: extPlayerId,
                },
              });
            }
            playersUpserted += 1;
          }
          if (pack.paging.current >= pack.paging.total) break;
          if (delay > 0) await this.api.sleep(delay);
        }
        if (delay > 0) await this.api.sleep(delay);
      }
      (out.leagues as Record<string, unknown>)[code] = {
        leagueId,
        /** /teams 返回的条数（与能否解析、库内是否有 af-t-* 无关） */
        teamsApiRows: items.length,
        teamApiResults,
        teamApiErrors: teamApiErrors ?? null,
        playersUpserted,
        teamsProcessed,
        /** 原先无 af-t-*，本趟用 /teams 节点写入的球队数（不再强制先跑赛程） */
        teamsMaterializedFromApi,
        teamsSkippedNoFixtureRow,
        /** 无法从响应中解析出球队 id（形状与预期不符时可排查） */
        teamsUnparsedRow,
      };
    }
    return out;
  }

  /**
   * 对世界杯（FIFA_WC 或 Competition.code=WC）且 `externalId=af-f-*` 的比赛：
   * 与联赛场次共用 {@link MatchAfFactsSyncService.syncByMatchId}（fixture + lineups + events + statistics）。
   */
  async enrichWcMatchesFromApiFootball(opts?: {
    maxMatches?: number;
    delayMs?: number;
  }): Promise<{ attempted: number; enriched: number; failed: number }> {
    const maxMatches = Math.min(128, Math.max(1, opts?.maxMatches ?? 56));
    const delay = Math.min(10_000, Math.max(0, opts?.delayMs ?? 1200));

    const wcTour = await this.prisma.tournament.findUnique({ where: { code: 'FIFA_WC' } });
    const whereMatch: Prisma.MatchWhereInput = wcTour
      ? { tournamentId: wcTour.id, externalId: { startsWith: 'af-f-' } }
      : {
          competition: { code: 'WC' },
          externalId: { startsWith: 'af-f-' },
        };

    const rows = await this.prisma.match.findMany({
      where: whereMatch,
      orderBy: { kickoffTime: 'asc' },
      take: maxMatches,
      select: { id: true, externalId: true },
    });

    let enriched = 0;
    let failed = 0;
    for (const row of rows) {
      const ext = row.externalId ?? '';
      const m = /^af-f-(\d+)$/.exec(ext);
      const fid = m ? Number(m[1]) : NaN;
      if (!Number.isFinite(fid)) {
        failed += 1;
        continue;
      }
      try {
        await this.matchAfFacts.syncByMatchId(row.id, {
          delayMs: 400,
          providerTag: 'api-football-wc-enrich',
        });
        enriched += 1;
      } catch {
        failed += 1;
      }
      if (delay > 0) await this.api.sleep(delay);
    }

    return { attempted: rows.length, enriched, failed };
  }

  /**
   * 世界杯：对 `af-t-*` 国家队写入 `wc2026Profile.apiFootballTeamStats`、自动生成 `historicalHeritageZh`，
   * 并可选写入 `apiFootballTeamCard`、补 `founded`（库内为空时）。
   * 依赖 `/teams?league=1&season=` 名单与 `/teams/statistics`。
   */
  async syncWc2026TeamProfilesFromApiFootball(opts: {
    season: number;
    delayMs?: number;
    maxTeams?: number;
  }): Promise<{
    attempted: number;
    updated: number;
    failed: number;
    skippedNoLocalTeam: number;
  }> {
    const leagueId = leagueIdForCode('WC');
    if (leagueId == null) {
      throw new BadRequestException('本地常量缺少 WC 的 api-sports league id');
    }
    const delay = Math.min(10_000, Math.max(0, opts.delayMs ?? 1200));
    const maxTeams = Math.min(64, Math.max(1, opts.maxTeams ?? 56));
    const pack = await this.api.getTeamsInLeague(leagueId, opts.season);
    let attempted = 0;
    let updated = 0;
    let failed = 0;
    let skippedNoLocalTeam = 0;
    let processed = 0;
    for (const wrap of pack.items) {
      if (processed >= maxTeams) break;
      const un = unwrapAfTeamRow(wrap);
      if (!un) {
        skippedNoLocalTeam += 1;
        continue;
      }
      const apiTeamId = un.apiTeamId;
      attempted += 1;
      processed += 1;
      const dbTeam = await this.prisma.team.findUnique({
        where: { externalId: `af-t-${apiTeamId}` },
      });
      if (!dbTeam) {
        skippedNoLocalTeam += 1;
        continue;
      }
      try {
        const { statistics } = await this.api.getTeamStatistics({
          teamId: apiTeamId,
          league: leagueId,
          season: opts.season,
        });
        let cardNode: Record<string, unknown> | null = null;
        try {
          const card = await this.api.getTeamById(apiTeamId);
          cardNode = card.item;
        } catch {
          cardNode = null;
        }
        const prev =
          dbTeam.wc2026Profile &&
          typeof dbTeam.wc2026Profile === 'object' &&
          !Array.isArray(dbTeam.wc2026Profile) ?
            { ...(dbTeam.wc2026Profile as Record<string, unknown>) }
          : {};
        prev.apiFootballTeamStats = {
          season: opts.season,
          leagueId,
          ingestedAt: new Date().toISOString(),
          statistics: shrinkJsonForWcProfile(statistics),
        };
        prev.historicalHeritageZh = buildWcHistoricalHeritageZhFromAfStats(statistics);
        if (cardNode) {
          prev.apiFootballTeamCard = shrinkJsonForWcProfile({
            id: cardNode.id,
            name: cardNode.name,
            code: cardNode.code,
            country: cardNode.country,
            national: cardNode.national,
            founded: cardNode.founded,
            logo: cardNode.logo,
          });
        }
        const foundedRaw = cardNode?.founded;
        const foundedNum =
          typeof foundedRaw === 'number' ?
            foundedRaw
          : typeof foundedRaw === 'string' && /^\d+$/.test(foundedRaw) ?
            Number(foundedRaw)
          : NaN;
        const countryStr =
          typeof cardNode?.country === 'string' && cardNode.country.trim() ?
            cardNode.country.trim()
          : undefined;
        await this.prisma.team.update({
          where: { id: dbTeam.id },
          data: {
            wc2026Profile: prev as Prisma.InputJsonValue,
            ...(dbTeam.founded == null &&
            Number.isFinite(foundedNum) &&
            foundedNum >= 1800 &&
            foundedNum <= 2100 ?
              { founded: Math.trunc(foundedNum) }
            : {}),
            ...(dbTeam.country == null && countryStr ? { country: countryStr } : {}),
          },
        });
        updated += 1;
      } catch {
        failed += 1;
      }
      if (delay > 0) await this.api.sleep(delay);
    }
    return { attempted, updated, failed, skippedNoLocalTeam };
  }

  /**
   * 世界杯一键：赛程（WC league=1）→ 全队列阵容 → **国家队 wc2026Profile + 历史底蕴摘要** → 单场线审/教练/场地。
   * 需有效 `API_FOOTBALL_API_KEY`；2026 世界杯赛季参数通常为 `season=2026`（以 api-sports 控制台为准）。
   */
  async importWorldCupFullBundle(opts: {
    season: number;
    syncFixtures?: boolean;
    syncSquads?: boolean;
    syncWcProfiles?: boolean;
    enrichMatches?: boolean;
    maxMatchesForEnrich?: number;
    maxTeamsForWcProfiles?: number;
    delayBetweenRequestsMs?: number;
  }): Promise<Record<string, unknown>> {
    const delay = Math.min(15_000, Math.max(0, opts.delayBetweenRequestsMs ?? 1500));
    const out: Record<string, unknown> = { season: opts.season };
    if (opts.syncFixtures !== false) {
      out.fixtures = await this.syncFixtures({
        competitionCodes: ['WC'],
        season: opts.season,
        delayBetweenRequestsMs: delay,
      });
    }
    if (opts.syncSquads !== false) {
      out.squads = await this.syncSquads({
        competitionCodes: ['WC'],
        season: opts.season,
        delayBetweenRequestsMs: delay,
        maxTeamsPerLeague: 56,
      });
    }
    if (opts.syncWcProfiles !== false) {
      out.wcProfiles = await this.syncWc2026TeamProfilesFromApiFootball({
        season: opts.season,
        delayMs: delay,
        maxTeams: opts.maxTeamsForWcProfiles ?? 56,
      });
    }
    if (opts.enrichMatches !== false) {
      out.enrichment = await this.enrichWcMatchesFromApiFootball({
        maxMatches: opts.maxMatchesForEnrich ?? 56,
        delayMs: delay,
      });
    }
    return out;
  }

  /**
   * Cron：开球前约 24h / 1h 写 Team/Player 快照 + 赔率；T-24 顺带 weather（best-effort）。
   */
  async runScheduledPreMatchWindows(now = new Date()): Promise<{
    attempted: number;
    t24: number;
    t1: number;
    snapshotOk: number;
    oddsOk: number;
    weatherOk: number;
    failed: number;
  }> {
    if (!this.config.get<string>('apiFootballApiKey')?.trim()) {
      return { attempted: 0, t24: 0, t1: 0, snapshotOk: 0, oddsOk: 0, weatherOk: 0, failed: 0 };
    }
    const maxM = Math.min(
      30,
      Math.max(1, this.config.get<number>('afPreMatchMaxPerTick') ?? 12),
    );
    const delayB = Math.min(
      15_000,
      Math.max(0, this.config.get<number>('afPreMatchDelayMs') ?? 900),
    );

    const rows = await this.prisma.match.findMany({
      where: {
        externalId: { startsWith: 'af-f-' },
        status: MatchStatus.SCHEDULED,
        kickoffTime: { gt: now },
      },
      orderBy: [{ isFeatured: 'desc' }, { kickoffTime: 'asc' }],
      take: maxM * 4,
      select: {
        id: true,
        kickoffTime: true,
        afPreMatchSnapshot24At: true,
        afPreMatchSnapshot1At: true,
        afOddsSnapshot24At: true,
        afOddsSnapshot1At: true,
      },
    });

    let t24 = 0;
    let t1 = 0;
    let snapshotOk = 0;
    let oddsOk = 0;
    let weatherOk = 0;
    let failed = 0;
    let attempted = 0;

    for (const row of rows) {
      if (attempted >= maxM) break;
      const in24 = isKickoffHorizonInWindow(now, row.kickoffTime, 24);
      const in1 = isKickoffHorizonInWindow(now, row.kickoffTime, 1);
      if (!in24 && !in1) continue;

      let phase: 'T24' | 'T1' | null = null;
      if (in1 && !row.afPreMatchSnapshot1At) phase = 'T1';
      else if (in24 && !row.afPreMatchSnapshot24At) phase = 'T24';
      else if (in1 && row.afPreMatchSnapshot1At && !row.afOddsSnapshot1At) phase = 'T1';
      else if (in24 && row.afPreMatchSnapshot24At && !row.afOddsSnapshot24At) phase = 'T24';
      else continue;

      attempted += 1;
      if (phase === 'T24') t24 += 1;
      else t1 += 1;

      try {
        const snap = await this.preMatchSnapshots.syncByMatchId(row.id, {
          delayMs: 400,
          phase,
        });
        if (!snap.detail.skipped) snapshotOk += 1;
      } catch {
        failed += 1;
      }

      try {
        const oddsPhase = phase;
        const odds = await this.oddsSnapshots.captureByMatchId(row.id, oddsPhase);
        if (!odds.skipped) oddsOk += 1;
      } catch {
        failed += 1;
      }

      if (phase === 'T24') {
        try {
          await this.weather.syncForMatch(row.id);
          weatherOk += 1;
        } catch {
          /* QWeather 未配置或单场失败不阻断 */
        }
      }

      if (delayB > 0) await this.api.sleep(delayB);
    }

    return { attempted, t24, t1, snapshotOk, oddsOk, weatherOk, failed };
  }
}
