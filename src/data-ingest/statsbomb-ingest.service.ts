import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSourceType, MatchStatus, Prisma } from '@prisma/client';
import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../prisma/prisma.service';
import {
  mergeSupplementarySource,
  shouldUseSupplementaryOnly,
} from '../match-facts/supplementary-facts.util';

dayjs.extend(utc);

/** StatsBomb `matches/{competition_id}/{season_id}.json` 中单场最小字段 */
type StatsbombMatchListRow = {
  match_id: number;
  match_date: string;
  kick_off?: string | null;
  home_team: {
    home_team_name: string;
    home_team_id?: number | null;
  };
  away_team: {
    away_team_name: string;
    away_team_id?: number | null;
  };
  home_score?: number | null;
  away_score?: number | null;
  match_status?: string;
  match_week?: number | null;
  competition_stage?: string | null;
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function normName(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function namesLikelySame(dbName: string, sbName: string): boolean {
  const a = normName(dbName);
  const b = normName(sbName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 4;
  return false;
}

/** 将 SB 的日期 + 开球时间按 UTC 写入（与旧模糊查询同日窗口一致；无 kick_off 则用正午 UTC）。 */
function parseKickoffUtcFromSb(matchDate: string, kickOff?: string | null): Date {
  const koRaw = (kickOff ?? '').trim();
  const timePart =
    koRaw.length >= 8 ? koRaw.split('.')[0].slice(0, 8)
    : koRaw.length >= 5 ? `${koRaw.split('.')[0]}:00`.slice(0, 8)
    : '12:00:00';
  const iso = `${matchDate}T${timePart}.000Z`;
  const d = dayjs.utc(iso);
  if (!d.isValid()) return dayjs.utc(`${matchDate}T12:00:00.000Z`).toDate();
  return d.toDate();
}

function mergeRefs(
  existing: unknown,
  patch: Record<string, string>,
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ?
      { ...(existing as Record<string, unknown>) }
    : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

function mergeLineupsWithStatsbomb(
  existing: unknown,
  statsbombLineups: unknown,
): Prisma.InputJsonValue {
  if (existing == null) {
    return { statsbomb: statsbombLineups } as Prisma.InputJsonValue;
  }
  if (typeof existing === 'object' && !Array.isArray(existing)) {
    return {
      ...(existing as Record<string, unknown>),
      statsbomb: statsbombLineups,
    } as Prisma.InputJsonValue;
  }
  return {
    other: existing,
    statsbomb: statsbombLineups,
  } as Prisma.InputJsonValue;
}

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** README：`data/competitions.json` 中每一行（一对 competition_id + season_id）。 */
export type StatsbombCatalogRow = {
  competition_id: number;
  season_id: number;
  country_name: string;
  competition_name: string;
  competition_gender?: string;
  competition_youth?: boolean;
  competition_international?: boolean;
  season_name: string;
  match_updated?: string;
  match_available?: string;
};

@Injectable()
export class StatsbombIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** 解析 `STATS_BOMB_OPEN_DATA_BASE_URL` 或入参（无尾斜杠）。 */
  resolveBaseUrl(baseUrl?: string): string {
    const base =
      (baseUrl || this.config.get<string>('statsBombOpenDataBaseUrl') || '')
        .replace(/\/$/, '');
    if (!base) {
      throw new BadRequestException('StatsBomb baseUrl 为空（配置 STATS_BOMB_OPEN_DATA_BASE_URL）');
    }
    return base;
  }

  /** 拉取 README 所述目录：`data/competitions.json`。 */
  async fetchOpenDataCatalog(baseUrl?: string): Promise<StatsbombCatalogRow[]> {
    const base = this.resolveBaseUrl(baseUrl);
    const url = `${base}/competitions.json`;
    const { data } = await axios.get<unknown>(url, {
      timeout: 120_000,
      responseType: 'json',
      maxContentLength: 5_000_000,
    });
    if (!Array.isArray(data)) {
      throw new BadRequestException('competitions.json 根类型须为数组');
    }
    return data as StatsbombCatalogRow[];
  }

  summarizeCatalogRows(rows: StatsbombCatalogRow[]) {
    const byCountry: Record<string, number> = {};
    const seasonsPerCompetitionId: Record<string, number> = {};
    for (const r of rows) {
      const c = r.country_name || '—';
      byCountry[c] = (byCountry[c] ?? 0) + 1;
      const k = String(r.competition_id);
      seasonsPerCompetitionId[k] = (seasonsPerCompetitionId[k] ?? 0) + 1;
    }
    return {
      totalRows: rows.length,
      byCountry,
      seasonsPerCompetitionId,
    };
  }

  /**
   * 目录审计：返回 `competitions.json` 全量 + 按国家/赛事汇总。
   * 可选对前 `probeLimit` 行请求 `matches/{cid}/{sid}.json` 仅统计数组长度（易触发 GitHub 限流，请调 `delayBetweenProbeMs`）。
   */
  async auditOpenDataCatalog(opts: {
    baseUrl?: string;
    includeMatchFileCounts?: boolean;
    probeLimit?: number;
    delayBetweenProbeMs?: number;
  }) {
    const base = this.resolveBaseUrl(opts.baseUrl);
    const rows = await this.fetchOpenDataCatalog(opts.baseUrl);
    const summary = this.summarizeCatalogRows(rows);
    const out: {
      baseUrl: string;
      readme:
        'https://github.com/statsbomb/open-data#readme — competitions.json + matches/{competition_id}/{season_id}.json';
      rows: StatsbombCatalogRow[];
      summary: typeof summary;
      matchFileProbes?: {
        competition_id: number;
        season_id: number;
        competition_name: string;
        season_name: string;
        matchCount: number | null;
        error?: string;
      }[];
      probesPartial?: boolean;
    } = {
      baseUrl: base,
      readme:
        'https://github.com/statsbomb/open-data#readme — competitions.json + matches/{competition_id}/{season_id}.json',
      rows,
      summary,
    };

    if (opts.includeMatchFileCounts === true) {
      const limit = Math.min(rows.length, Math.max(1, opts.probeLimit ?? 20));
      const delay = Math.min(15_000, Math.max(0, opts.delayBetweenProbeMs ?? 280));
      const probes: NonNullable<(typeof out)['matchFileProbes']> = [];
      for (let i = 0; i < limit; i++) {
        if (i > 0 && delay > 0) await sleep(delay);
        const r = rows[i];
        try {
          const { data } = await axios.get<unknown>(
            `${base}/matches/${r.competition_id}/${r.season_id}.json`,
            {
              timeout: 120_000,
              responseType: 'json',
              maxContentLength: 100_000_000,
            },
          );
          probes.push({
            competition_id: r.competition_id,
            season_id: r.season_id,
            competition_name: r.competition_name,
            season_name: r.season_name,
            matchCount: Array.isArray(data) ? data.length : null,
          });
        } catch (e: unknown) {
          probes.push({
            competition_id: r.competition_id,
            season_id: r.season_id,
            competition_name: r.competition_name,
            season_name: r.season_name,
            matchCount: null,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      out.matchFileProbes = probes;
      out.probesPartial = limit < rows.length;
    }
    return out;
  }

  /**
   * 按 README 目录批量：对 `competitions.json` 中映射到的每一行执行 `ingestCompetitionSeason`。
   * - `dryRun: true`：不写库，只返回计划行；可选 `includeMatchCountsInDryRun` 探测每场次数文件长度。
   */
  async ingestOpenDataCatalogBatch(opts: {
    baseUrl?: string;
    sbCompetitionIdToCode: Record<string, string>;
    competitionIdsAllow?: number[];
    seasonIdsAllow?: number[];
    maxPairs?: number;
    maxMatchesPerPair?: number;
    delayMs?: number;
    delayBetweenPairsMs?: number;
    maxEventsStored?: number;
    skipCreateMatch?: boolean;
    dryRun?: boolean;
    includeMatchCountsInDryRun?: boolean;
    dryRunProbeLimit?: number;
    dryRunProbeDelayMs?: number;
  }) {
    this.resolveBaseUrl(opts.baseUrl);
    const catalog = await this.fetchOpenDataCatalog(opts.baseUrl);
    const map = opts.sbCompetitionIdToCode;
    const maxPairs = Math.min(200, Math.max(1, opts.maxPairs ?? 25));
    const pairDelay = Math.min(120_000, Math.max(0, opts.delayBetweenPairsMs ?? 650));

    const codesInDb = new Set(
      (
        await this.prisma.competition.findMany({
          select: { code: true },
        })
      )
        .filter((c): c is { code: string } => typeof c.code === 'string' && c.code.trim() !== '')
        .map((c) => c.code.trim().toUpperCase()),
    );

    let skippedCatalogRowsNoLocalCompetition = 0;
    const filtered = catalog
      .filter((r) => {
        if (
          opts.competitionIdsAllow?.length &&
          !opts.competitionIdsAllow.includes(r.competition_id)
        ) {
          return false;
        }
        if (opts.seasonIdsAllow?.length && !opts.seasonIdsAllow.includes(r.season_id)) {
          return false;
        }
        const raw = map[String(r.competition_id)]?.trim();
        if (!raw) return false;
        const code = raw.toUpperCase();
        if (!codesInDb.has(code)) {
          skippedCatalogRowsNoLocalCompetition += 1;
          return false;
        }
        return true;
      })
      .slice(0, maxPairs);

    const planned = filtered.map((r) => ({
      competition_id: r.competition_id,
      season_id: r.season_id,
      competitionCode: map[String(r.competition_id)].trim().toUpperCase(),
      competition_name: r.competition_name,
      country_name: r.country_name,
      season_name: r.season_name,
    }));

    const catalogSummary = this.summarizeCatalogRows(catalog);

    if (opts.dryRun === true) {
      let matchFileProbes:
        | {
            competition_id: number;
            season_id: number;
            matchCount: number | null;
            error?: string;
          }[]
        | undefined;
      if (opts.includeMatchCountsInDryRun === true && planned.length > 0) {
        const base = this.resolveBaseUrl(opts.baseUrl);
        const lim = Math.min(planned.length, Math.max(1, opts.dryRunProbeLimit ?? 15));
        const dly = Math.min(15_000, Math.max(0, opts.dryRunProbeDelayMs ?? 300));
        matchFileProbes = [];
        for (let i = 0; i < lim; i++) {
          if (i > 0 && dly > 0) await sleep(dly);
          const p = planned[i];
          try {
            const { data } = await axios.get<unknown>(
              `${base}/matches/${p.competition_id}/${p.season_id}.json`,
              {
                timeout: 120_000,
                responseType: 'json',
                maxContentLength: 100_000_000,
              },
            );
            matchFileProbes.push({
              competition_id: p.competition_id,
              season_id: p.season_id,
              matchCount: Array.isArray(data) ? data.length : null,
            });
          } catch (e: unknown) {
            matchFileProbes.push({
              competition_id: p.competition_id,
              season_id: p.season_id,
              matchCount: null,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      return {
        ok: true,
        dryRun: true,
        catalogSummary,
        plannedPairs: planned.length,
        planned,
        matchFileProbes,
        skippedCatalogRowsNoLocalCompetition,
        hint:
          planned.length === 0 ?
            '无匹配行：请检查映射 / 预设是否覆盖目录中的 competition_id，或本地是否已有对应 Competition.code；亦可放宽 competitionIdsAllow / seasonIdsAllow。'
          : undefined,
      };
    }

    if (planned.length === 0) {
      return {
        ok: true,
        dryRun: false,
        catalogSummary,
        plannedPairs: 0,
        pairResults: [] as object[],
        skippedCatalogRowsNoLocalCompetition,
        totals: {
          factsWritten: 0,
          createdMatches: 0,
          linkedUpdated: 0,
          skippedNoLink: 0,
          skippedAmbiguous: 0,
          fetchErrors: 0,
        },
        warning:
          '未执行入库：过滤后 0 条 (competition_id, season_id)。请调整 mappings / 预设、maxPairs / allow 列表，或先在库内创建缺失的 Competition。',
      };
    }

    const pairResults: object[] = [];
    let factsWritten = 0;
    let createdMatches = 0;
    let linkedUpdated = 0;
    let skippedNoLink = 0;
    let skippedAmbiguous = 0;
    let fetchErrors = 0;
    let pairOk = 0;
    let pairFail = 0;

    for (let i = 0; i < planned.length; i++) {
      const p = planned[i];
      if (i > 0 && pairDelay > 0) await sleep(pairDelay);
      try {
        const res = await this.ingestCompetitionSeason({
          sbCompetitionId: p.competition_id,
          sbSeasonId: p.season_id,
          competitionCode: p.competitionCode,
          baseUrl: opts.baseUrl,
          maxMatches: opts.maxMatchesPerPair,
          delayMs: opts.delayMs,
          maxEventsStored: opts.maxEventsStored,
          skipCreateMatch: opts.skipCreateMatch,
        });
        const failed =
          res && typeof res === 'object' && 'ok' in res && (res as { ok?: boolean }).ok === false;
        if (failed) {
          pairFail += 1;
          pairResults.push({ ...p, ok: false, result: res });
        } else {
          pairOk += 1;
          const r = res as unknown as {
            factsWritten?: number;
            createdMatches?: number;
            linkedUpdated?: number;
            skippedNoLink?: number;
            skippedAmbiguous?: number;
            fetchErrors?: number;
          };
          factsWritten += Number(r.factsWritten ?? 0);
          createdMatches += Number(r.createdMatches ?? 0);
          linkedUpdated += Number(r.linkedUpdated ?? 0);
          skippedNoLink += Number(r.skippedNoLink ?? 0);
          skippedAmbiguous += Number(r.skippedAmbiguous ?? 0);
          fetchErrors += Number(r.fetchErrors ?? 0);
          pairResults.push({ ...p, ok: true, result: res });
        }
      } catch (e: unknown) {
        pairFail += 1;
        pairResults.push({
          ...p,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      ok: true,
      dryRun: false,
      catalogSummary,
      plannedPairs: planned.length,
      pairResults,
      skippedCatalogRowsNoLocalCompetition,
      totals: {
        factsWritten,
        createdMatches,
        linkedUpdated,
        skippedNoLink,
        skippedAmbiguous,
        fetchErrors,
        pairOk,
        pairFail,
      },
    };
  }

  /**
   * 用 StatsBomb 赛程行补全已有 `Match`：比分/状态/matchday/round 仅在库内为空或仍为未赛时写入，避免覆盖 AF/FD 已维护字段。
   */
  private async mergeMatchFromStatsbombRow(
    matchId: string,
    m: StatsbombMatchListRow,
  ): Promise<void> {
    const cur = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        homeScore: true,
        awayScore: true,
        status: true,
        matchday: true,
        round: true,
      },
    });
    if (!cur) return;

    const hs = m.home_score;
    const as = m.away_score;
    const data: Prisma.MatchUpdateInput = {};

    if (hs != null && cur.homeScore == null) data.homeScore = hs;
    if (as != null && cur.awayScore == null) data.awayScore = as;

    if (
      hs != null &&
      as != null &&
      (cur.status === MatchStatus.SCHEDULED || cur.status === MatchStatus.UNKNOWN)
    ) {
      data.status = MatchStatus.FINISHED;
    }

    if (m.match_week != null && cur.matchday == null) {
      data.matchday = m.match_week;
    }
    if (m.competition_stage && typeof m.competition_stage === 'string' && !cur.round) {
      data.round = m.competition_stage;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.match.update({ where: { id: matchId }, data });
    }
  }

  /** 按 StatsBomb `team_id` 建/复用 `Team`（`sb-t-{id}`）；无 id 时用规范化 slug。 */
  private async ensureSbTeam(opts: {
    sbTeamId?: number | null;
    name: string;
  }): Promise<string> {
    const name = opts.name.trim();
    if (!name) {
      throw new Error('StatsBomb 球队名为空');
    }

    if (opts.sbTeamId != null && Number.isFinite(opts.sbTeamId)) {
      const ext = `sb-t-${opts.sbTeamId}`;
      const hit = await this.prisma.team.findFirst({ where: { externalId: ext } });
      if (hit) return hit.id;
      const row = await this.prisma.team.create({
        data: {
          externalId: ext,
          nameEn: name,
          nameCn: name,
          dataSource: DataSourceType.STATSBOMB,
        },
      });
      return row.id;
    }

    const slug = `sb-x-${normName(name)}`.slice(0, 90);
    const byExt = await this.prisma.team.findFirst({ where: { externalId: slug } });
    if (byExt) return byExt.id;
    const byName = await this.prisma.team.findFirst({ where: { nameEn: name } });
    if (byName) return byName.id;

    const row = await this.prisma.team.create({
      data: {
        externalId: slug,
        nameEn: name,
        nameCn: name,
        dataSource: DataSourceType.STATSBOMB,
      },
    });
    return row.id;
  }

  /** 库内无对应场次时：新建 `Match`（`externalId=sb-m-{match_id}`，`statsbombMatchId` 已设）。 */
  private async createMatchFromStatsbombRow(
    m: StatsbombMatchListRow,
    comp: { id: string; tournamentId: string | null; seasonId: string | null },
  ) {
    const extMatch = `sb-m-${m.match_id}`;
    const existing = await this.prisma.match.findFirst({
      where: {
        OR: [{ statsbombMatchId: m.match_id }, { externalId: extMatch }],
      },
    });
    if (existing) return existing;

    const homeId = await this.ensureSbTeam({
      sbTeamId: m.home_team?.home_team_id,
      name: m.home_team?.home_team_name ?? '',
    });
    const awayId = await this.ensureSbTeam({
      sbTeamId: m.away_team?.away_team_id,
      name: m.away_team?.away_team_name ?? '',
    });

    const kickoff = parseKickoffUtcFromSb(m.match_date, m.kick_off);
    const hs = m.home_score;
    const as = m.away_score;
    const status =
      hs != null && as != null ? MatchStatus.FINISHED : MatchStatus.SCHEDULED;

    return this.prisma.match.create({
      data: {
        externalId: extMatch,
        statsbombMatchId: m.match_id,
        competitionId: comp.id,
        tournamentId: comp.tournamentId ?? undefined,
        seasonId: comp.seasonId ?? undefined,
        homeTeamId: homeId,
        awayTeamId: awayId,
        kickoffTime: kickoff,
        status,
        homeScore: hs ?? undefined,
        awayScore: as ?? undefined,
        matchday: m.match_week ?? undefined,
        round: m.competition_stage ?? undefined,
        dataSource: DataSourceType.STATSBOMB,
      },
    });
  }

  /**
   * 拉取 StatsBomb Open Data：赛程索引 JSON + 每场 lineups/events → `MatchFacts`。
   * - **已有关联**（`statsbombMatchId` 或赛日+队名唯一命中）：合并更新 `Match` 空字段 + upsert `MatchFacts`（`rawStatsbomb`、合并 `lineups` / `externalRefs`；`ftHome/ftAway` 仅补空）。
   * - **无关联且未** `skipCreateMatch`：新建 `Team`（`sb-t-*` / `sb-x-*`）与 `Match`（`sb-m-*`）再写入。
   */
  async ingestCompetitionSeason(opts: {
    sbCompetitionId: number;
    sbSeasonId: number;
    competitionCode: string;
    baseUrl?: string;
    maxMatches?: number;
    delayMs?: number;
    /** 写入 rawStatsbomb.events 的最大条数；0 表示不写 events（仍写 match + lineups） */
    maxEventsStored?: number;
    /** true：不新建 `Match`，找不到则跳过（旧行为） */
    skipCreateMatch?: boolean;
  }) {
    const base = this.resolveBaseUrl(opts.baseUrl);

    const comp = await this.prisma.competition.findFirst({
      where: { code: opts.competitionCode.trim() },
    });
    if (!comp) {
      throw new NotFoundException(
        `本地缺少 competition code=${opts.competitionCode}`,
      );
    }

    const matchesUrl = `${base}/matches/${opts.sbCompetitionId}/${opts.sbSeasonId}.json`;
    const { data } = await axios.get<unknown>(matchesUrl, {
      timeout: 120_000,
      responseType: 'json',
    });
    if (!Array.isArray(data)) {
      return {
        ok: false,
        url: matchesUrl,
        error: 'matches JSON 根类型须为数组',
      };
    }

    const maxMatches = Math.min(500, Math.max(1, opts.maxMatches ?? 80));
    const delayMs = Math.min(30_000, Math.max(0, opts.delayMs ?? 400));
    const maxEventsStored =
      opts.maxEventsStored === undefined ? 4000
      : Math.min(50_000, Math.max(0, opts.maxEventsStored));
    const skipCreateMatch = opts.skipCreateMatch === true;

    let processed = 0;
    let linkedUpdated = 0;
    let factsWritten = 0;
    let skippedNoLink = 0;
    let skippedAmbiguous = 0;
    let fetchErrors = 0;
    let createdMatches = 0;

    const rows = data as StatsbombMatchListRow[];
    const slice = rows.slice(0, maxMatches);

    for (const m of slice) {
      if (delayMs > 0 && processed > 0) await sleep(delayMs);

      const matchIdSb = m.match_id;
      const homeSb = m.home_team?.home_team_name ?? '';
      const awaySb = m.away_team?.away_team_name ?? '';

      let local = await this.prisma.match.findFirst({
        where: { statsbombMatchId: matchIdSb },
        include: { homeTeam: true, awayTeam: true },
      });

      if (!local) {
        const day = m.match_date;
        if (!day) {
          skippedNoLink += 1;
          processed += 1;
          continue;
        }
        const dayStart = dayjs.utc(`${day}T00:00:00.000Z`).toDate();
        const dayEnd = dayjs.utc(`${day}T23:59:59.999Z`).toDate();

        const candidates = await this.prisma.match.findMany({
          where: {
            competitionId: comp.id,
            kickoffTime: { gte: dayStart, lte: dayEnd },
          },
          include: { homeTeam: true, awayTeam: true },
        });

        const hits = candidates.filter(
          (c) =>
            (namesLikelySame(c.homeTeam.nameEn, homeSb) ||
              namesLikelySame(c.homeTeam.nameCn, homeSb)) &&
            (namesLikelySame(c.awayTeam.nameEn, awaySb) ||
              namesLikelySame(c.awayTeam.nameCn, awaySb)),
        );

        if (hits.length === 1) {
          local = hits[0];
        } else if (hits.length > 1) {
          skippedAmbiguous += 1;
          processed += 1;
          continue;
        } else if (
          !skipCreateMatch &&
          homeSb &&
          awaySb
        ) {
          const created = await this.createMatchFromStatsbombRow(m, comp);
          createdMatches += 1;
          local = await this.prisma.match.findFirst({
            where: { id: created.id },
            include: { homeTeam: true, awayTeam: true },
          });
        } else {
          skippedNoLink += 1;
          processed += 1;
          continue;
        }
      }

      if (!local) {
        processed += 1;
        continue;
      }

      await this.mergeMatchFromStatsbombRow(local.id, m);

      if (local.statsbombMatchId !== matchIdSb) {
        try {
          await this.prisma.match.update({
            where: { id: local.id },
            data: { statsbombMatchId: matchIdSb },
          });
          linkedUpdated += 1;
        } catch {
          skippedAmbiguous += 1;
          processed += 1;
          continue;
        }
      }

      const lineupsUrl = `${base}/lineups/${matchIdSb}.json`;
      const eventsUrl = `${base}/events/${matchIdSb}.json`;

      let lineups: unknown;
      let events: unknown;
      try {
        const [lr, er] = await Promise.all([
          axios.get<unknown>(lineupsUrl, { timeout: 120_000, responseType: 'json' }),
          maxEventsStored === 0 ?
            Promise.resolve({ data: null as unknown })
          : axios.get<unknown>(eventsUrl, { timeout: 120_000, responseType: 'json' }),
        ]);
        lineups = lr.data;
        if (maxEventsStored > 0 && Array.isArray(er.data)) {
          const arr = er.data as unknown[];
          const total = arr.length;
          events =
            total <= maxEventsStored ?
              arr
            : {
                events: arr.slice(0, maxEventsStored),
                truncated: true,
                total,
              };
        } else {
          events = maxEventsStored === 0 ? null : er.data;
        }
      } catch {
        fetchErrors += 1;
        processed += 1;
        continue;
      }

      const existingFacts = await this.prisma.matchFacts.findUnique({
        where: { matchId: local.id },
      });

      const rawStatsbomb = {
        source: 'statsbomb-open-data',
        licenseNote:
          'https://github.com/statsbomb/open-data — use only per dataset terms; academic/public interest etc.',
        fetchedAt: new Date().toISOString(),
        baseUrl: base,
        matchListRow: m,
        lineupsUrl,
        eventsUrl,
        lineups,
        events,
        eventsStoredCap: maxEventsStored,
      } as Prisma.InputJsonValue;

      const externalRefs = mergeRefs(existingFacts?.externalRefs, {
        STATSBOMB: String(matchIdSb),
      });

      const supplementaryOnly = shouldUseSupplementaryOnly(existingFacts);
      const nextLineups = supplementaryOnly
        ? existingFacts?.lineups
        : mergeLineupsWithStatsbomb(existingFacts?.lineups, lineups);

      const supplementaryPayload = {
        source: 'statsbomb-open-data',
        matchIdSb,
        lineups,
        eventsSample: Array.isArray(events) ? events.slice(0, 50) : events,
        fetchedAt: new Date().toISOString(),
      };

      const ftPatch: Pick<Prisma.MatchFactsUpdateInput, 'ftHome' | 'ftAway'> = {};
      if (existingFacts == null) {
        ftPatch.ftHome = m.home_score ?? undefined;
        ftPatch.ftAway = m.away_score ?? undefined;
      } else {
        if (existingFacts.ftHome == null && m.home_score != null) {
          ftPatch.ftHome = m.home_score;
        }
        if (existingFacts.ftAway == null && m.away_score != null) {
          ftPatch.ftAway = m.away_score;
        }
      }

      const supplementaryFacts = mergeSupplementarySource(
        existingFacts?.supplementaryFacts,
        'STATSBOMB',
        supplementaryPayload,
      );

      await this.prisma.matchFacts.upsert({
        where: { matchId: local.id },
        create: {
          matchId: local.id,
          ftHome: m.home_score ?? undefined,
          ftAway: m.away_score ?? undefined,
          rawStatsbomb,
          externalRefs,
          lineups: nextLineups ?? undefined,
          supplementaryFacts: supplementaryFacts as object,
          primaryProvider: DataSourceType.UNKNOWN,
          structureProvider: DataSourceType.STATSBOMB,
          providerTag: 'statsbomb-open-data',
          lastSyncedAt: new Date(),
          validatedAt: new Date(),
        },
        update: {
          rawStatsbomb,
          externalRefs,
          ...(supplementaryOnly
            ? { supplementaryFacts: supplementaryFacts as object }
            : nextLineups != null
              ? { lineups: nextLineups as Prisma.InputJsonValue }
              : {}),
          structureProvider: DataSourceType.STATSBOMB,
          providerTag: existingFacts?.providerTag || 'statsbomb-open-data',
          lastSyncedAt: new Date(),
          ...ftPatch,
        },
      });

      factsWritten += 1;
      processed += 1;
    }

    return {
      ok: true,
      matchesUrl,
      sbCompetitionId: opts.sbCompetitionId,
      sbSeasonId: opts.sbSeasonId,
      competitionCode: opts.competitionCode,
      totalInFile: rows.length,
      attempted: slice.length,
      processed,
      factsWritten,
      linkedUpdated,
      createdMatches,
      skippedNoLink,
      skippedAmbiguous,
      fetchErrors,
      maxMatches,
      delayMs,
      maxEventsStored,
      skipCreateMatch,
    };
  }
}
