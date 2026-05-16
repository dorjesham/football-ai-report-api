import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSourceType, Prisma } from '@prisma/client';
import axios, { type AxiosInstance } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { FootballDataService } from '../football-data/football-data.service';
import { FOOTBALL_DATA_COMPETITION_CODES } from '../common/constants/competition.constant';
import {
  resolveFdPersonAvatarUrl,
  resolveFdPersonNameCn,
} from '../common/constants/football-data-person-display';
import { pickFirstHttpImageUrlFromUnknown } from '../common/utils/fd-image-url.util';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** football-data /teams/{id} 的 squad 成员（与文档字段对齐的宽松类型） */
type FdSquadMember = Record<string, unknown> & {
  id?: number;
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  shirtNumber?: number | null;
  marketValue?: number | null;
  contract?: { start?: string | null; until?: string | null } | null;
};

type FdTeamDetail = {
  id?: number;
  name?: string;
  shortName?: string;
  crest?: string;
  tla?: string | null;
  founded?: number | null;
  venue?: string | null;
  website?: string | null;
  address?: string | null;
  clubColors?: string | null;
  marketValue?: number | null;
  squad?: FdSquadMember[];
  coach?: Record<string, unknown> | null;
  runningCompetitions?: unknown[];
  area?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function mergePlayerProfile(
  prev: Prisma.JsonValue | null | undefined,
  fdSquadPatch: Record<string, unknown>,
  fdPerson?: unknown,
  fdPersonMatches?: unknown,
): Prisma.InputJsonValue {
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  const prevSquad = asRecord(base.fdSquad) ?? {};
  base.fdSquad = { ...prevSquad, ...fdSquadPatch };
  if (fdPerson !== undefined) base.fdPerson = fdPerson as Prisma.InputJsonValue;
  if (fdPersonMatches !== undefined) {
    base.fdPersonMatches = fdPersonMatches as Prisma.InputJsonValue;
  }
  return base as Prisma.InputJsonValue;
}

/** 合并写入 `Team.coachProfile`，保留手工键 `manual` / `manualOverlays`。 */
function mergeTeamCoachProfile(
  prev: Prisma.JsonValue | null | undefined,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  const manual = base.manual;
  const manualOverlays = base.manualOverlays;
  delete base.manual;
  delete base.manualOverlays;
  const merged = { ...base, ...patch };
  if (manual !== undefined) merged.manual = manual;
  if (manualOverlays !== undefined) merged.manualOverlays = manualOverlays;
  return merged as Prisma.InputJsonValue;
}

function pickFormationFromTeamNode(teamNode: unknown): string | null {
  if (!teamNode || typeof teamNode !== 'object') return null;
  const t = teamNode as Record<string, unknown>;
  if (typeof t.formation === 'string' && t.formation.trim()) return t.formation.trim();
  const lineup = t.lineup;
  if (Array.isArray(lineup) && lineup.length) {
    const first = lineup[0];
    if (first && typeof first === 'object') {
      const f = (first as Record<string, unknown>).formation;
      if (typeof f === 'string' && f.trim()) return f.trim();
    }
  }
  return null;
}

function bumpHistogram(h: Record<string, number>, key: string | null) {
  if (!key) return;
  h[key] = (h[key] ?? 0) + 1;
}

function topHistogramLines(h: Record<string, number>, maxLines = 4): string[] {
  return Object.entries(h)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxLines)
    .map(([k, v]) => `${k}（${v} 场样本）`);
}

/** 从 FD 单场详情中摘录与本队 FD id 相关的阵型、对手与裁判席信息 */
function extractMatchTacticsForFdTeam(
  matchDetail: Record<string, unknown>,
  fdTeamId: number,
): Record<string, unknown> | null {
  const home = matchDetail.homeTeam as Record<string, unknown> | undefined;
  const away = matchDetail.awayTeam as Record<string, unknown> | undefined;
  const hid = home?.id != null ? Number(home.id) : NaN;
  const aid = away?.id != null ? Number(away.id) : NaN;
  let side: 'home' | 'away' | null = null;
  if (Number.isFinite(hid) && hid === fdTeamId) side = 'home';
  else if (Number.isFinite(aid) && aid === fdTeamId) side = 'away';
  if (!side) return null;
  const self = side === 'home' ? home! : away!;
  const opp = side === 'home' ? away! : home!;
  const selfXi = Array.isArray(self.lineup) ? (self.lineup as unknown[]).length : 0;
  const selfBench = Array.isArray(self.bench) ? (self.bench as unknown[]).length : 0;
  return {
    matchId: matchDetail.id,
    utcDate: matchDetail.utcDate,
    status: matchDetail.status,
    competition: matchDetail.competition,
    side,
    ourFormation: pickFormationFromTeamNode(self),
    opponentFormation: pickFormationFromTeamNode(opp),
    ourLineupCount: selfXi,
    ourBenchCount: selfBench,
    opponentLineupCount: Array.isArray(opp.lineup) ? (opp.lineup as unknown[]).length : 0,
    referees: matchDetail.referees ?? null,
    coaches: matchDetail.coaches ?? null,
  };
}

type IngestCodeSummary = {
  teamsSeen: number;
  teamsFetched: number;
  playersUpserted: number;
  personEnriched: number;
  coachProfilesWritten: number;
  warnings: string[];
  errors: string[];
};

@Injectable()
export class FdPlayerIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly footballData: FootballDataService,
  ) {}

  private http(): AxiosInstance {
    const key = this.config.get<string>('footballDataApiKey');
    if (!key?.trim()) {
      throw new Error('FOOTBALL_DATA_API_KEY missing');
    }
    const baseURL =
      this.config.get<string>('footballDataBaseUrl') || 'https://api.football-data.org/v4';
    return axios.create({
      baseURL,
      timeout: 45000,
      headers: { 'X-Auth-Token': key.trim() },
    });
  }

  private async logApi(
    endpoint: string,
    statusCode: number | null,
    success: boolean,
    message?: string,
  ) {
    await this.prisma.apiLog.create({
      data: {
        provider: 'football-data',
        endpoint,
        method: 'GET',
        statusCode: statusCode ?? undefined,
        success,
        message,
      },
    });
  }

  /**
   * 组装 `Team.coachProfile`：/teams 的 coach +（可选）/persons、执教比赛统计、
   * 近若干场 /matches 详情的阵型与教练席摘录；战术理念叙述 FD 不提供，见 tacticalSemantics。
   */
  private async buildCoachProfile(
    http: AxiosInstance,
    detail: FdTeamDetail,
    prismaTeamId: string,
    fdTeamNumericId: number,
    competitionCode: string,
    opts: {
      delayBetweenPersonMs: number;
      enrichCoach: boolean;
      coachMatchDetailSample: number;
    },
    summary: IngestCodeSummary,
  ): Promise<Prisma.InputJsonValue> {
    const row = await this.prisma.team.findUnique({
      where: { id: prismaTeamId },
      select: { coachProfile: true },
    });
    const coach = detail.coach;
    const teamEndpoint = {
      coach: coach ?? null,
      runningCompetitions: detail.runningCompetitions ?? null,
      area: detail.area ?? null,
      marketValue: detail.marketValue ?? null,
      tla: detail.tla ?? null,
      address: detail.address ?? null,
      clubColors: detail.clubColors ?? null,
    };
    const tacticalSemantics = {
      philosophyNarrative: null as string | null,
      playingStyleNarrative: null as string | null,
      structureHintsFromFormations: [] as string[],
      dataAvailability: 'TEAM_ENDPOINT_ONLY' as string,
      limitationsZh:
        'football-data.org 不向教练 Person 提供「战术理念」长文本；打法与布阵仅能基于 match 详情中的 formation、lineup、coaches 等可验证字段做统计与摘录。若需叙述性战术档案，请另接 Wikipedia、俱乐部官网或自建球探笔记，并写入 coachProfile.manual。',
    };
    const basePatch: Record<string, unknown> = {
      schemaVersion: 2,
      lastIngestedAt: new Date().toISOString(),
      fromCompetitionCode: competitionCode,
      fdTeamId: fdTeamNumericId,
      teamEndpoint,
      coachPerson: null,
      coachCareerMatches: null,
      recentMatchTactics: null,
      derived: null,
      tacticalSemantics,
      coachPresentation: null as Record<string, unknown> | null,
    };

    if (!opts.enrichCoach || !coach || coach.id == null || !Number.isFinite(Number(coach.id))) {
      tacticalSemantics.dataAvailability =
        coach && coach.id != null ? 'TEAM_ENDPOINT_ONLY' : 'NO_COACH_ID';
      if (coach && coach.id != null && Number.isFinite(Number(coach.id))) {
        const cid = String(Number(coach.id));
        const c = coach as Record<string, unknown>;
        const coachNameEn =
          typeof c.name === 'string' && c.name.trim() ?
            c.name.trim()
          : [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `FD#${cid}`;
        basePatch.coachPresentation = {
          fdPersonId: Number(coach.id),
          nameEn: coachNameEn,
          nameCn: resolveFdPersonNameCn(cid, coachNameEn),
          avatarUrl:
            resolveFdPersonAvatarUrl(cid) ?? pickFirstHttpImageUrlFromUnknown(coach) ?? null,
        };
      }
      summary.coachProfilesWritten += 1;
      return mergeTeamCoachProfile(row?.coachProfile, basePatch);
    }

    const coachId = Number(coach.id);
    let coachPerson: unknown = null;
    let coachCareerMatches: unknown = null;
    const recentMatchTactics: Record<string, unknown>[] = [];
    const formationHist: Record<string, number> = {};
    const oppFormationHist: Record<string, number> = {};

    try {
      await sleep(Math.max(0, opts.delayBetweenPersonMs));
      const pRes = await http.get(`/persons/${encodeURIComponent(String(coachId))}`);
      await this.logApi(`/persons/${coachId}`, pRes.status, true);
      coachPerson = pRes.data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.warnings.push(`coach ${coachId} person: ${msg}`);
    }

    try {
      await sleep(Math.max(0, opts.delayBetweenPersonMs));
      const mRes = await http.get(`/persons/${encodeURIComponent(String(coachId))}/matches`, {
        params: { limit: 40 },
      });
      await this.logApi(`/persons/${coachId}/matches`, mRes.status, true);
      const md = mRes.data as {
        aggregations?: unknown;
        resultSet?: unknown;
        matches?: unknown[];
      };
      coachCareerMatches = {
        ingestedAt: new Date().toISOString(),
        aggregations: md.aggregations ?? null,
        resultSet: md.resultSet ?? null,
        matchListSample:
          Array.isArray(md.matches) ?
            md.matches.slice(0, 20).map((m) => {
              const x = m as Record<string, unknown>;
              return {
                id: x.id,
                utcDate: x.utcDate,
                status: x.status,
                competition: x.competition,
              };
            })
          : [],
      };
      const matchesArr = Array.isArray(md.matches) ? md.matches : [];
      const sampleN = Math.min(
        Math.max(0, opts.coachMatchDetailSample),
        matchesArr.length,
      );
      for (let i = 0; i < sampleN; i++) {
        const m = matchesArr[i] as Record<string, unknown>;
        const mid = m.id;
        if (mid == null) continue;
        try {
          await sleep(Math.max(0, opts.delayBetweenPersonMs));
          const dRes = await http.get(`/matches/${encodeURIComponent(String(mid))}`);
          await this.logApi(`/matches/${mid}`, dRes.status, true);
          const droot = dRes.data as Record<string, unknown>;
          const slice = extractMatchTacticsForFdTeam(droot, fdTeamNumericId);
          if (slice) {
            recentMatchTactics.push(slice);
            bumpHistogram(formationHist, (slice.ourFormation as string) || null);
            bumpHistogram(oppFormationHist, (slice.opponentFormation as string) || null);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          summary.warnings.push(`coach match ${mid}: ${msg}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.warnings.push(`coach ${coachId} matches: ${msg}`);
    }

    basePatch.coachPerson = coachPerson;
    basePatch.coachCareerMatches = coachCareerMatches;
    basePatch.recentMatchTactics =
      recentMatchTactics.length ? recentMatchTactics : null;
    const matchesAnalyzed = recentMatchTactics.length;
    basePatch.derived =
      matchesAnalyzed > 0 ?
        {
          matchesAnalyzed,
          formationHistogram: formationHist,
          opponentFormationHistogram: oppFormationHist,
          formationTopLines: topHistogramLines(formationHist),
          opponentFormationTopLines: topHistogramLines(oppFormationHist),
        }
      : null;
    tacticalSemantics.dataAvailability =
      coachPerson || coachCareerMatches ? 'FULL_FD_COACH_ENRICHMENT' : 'PARTIAL_COACH_ENRICHMENT';
    tacticalSemantics.structureHintsFromFormations = [
      ...topHistogramLines(formationHist, 3),
      ...topHistogramLines(oppFormationHist, 2).map((s) => `对手 ${s}`),
    ].filter(Boolean);

    const coachIdStr = String(coachId);
    const c = coach as Record<string, unknown>;
    const coachNameEn =
      typeof c.name === 'string' && c.name.trim() ?
        c.name.trim()
      : [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `FD#${coachIdStr}`;
    basePatch.coachPresentation = {
      fdPersonId: coachId,
      nameEn: coachNameEn,
      nameCn: resolveFdPersonNameCn(coachIdStr, coachNameEn),
      avatarUrl:
        resolveFdPersonAvatarUrl(coachIdStr) ??
        pickFirstHttpImageUrlFromUnknown(coach) ??
        pickFirstHttpImageUrlFromUnknown(coachPerson) ??
        null,
    };

    summary.coachProfilesWritten += 1;
    return mergeTeamCoachProfile(row?.coachProfile, basePatch);
  }

  /**
   * 按联赛 code 枚举球队 → GET /teams/{id} 取完整 squad（+ 可选 GET /persons/{id} 与 matches 摘要），
   * upsert `Player`；并写入 `Team.coachProfile`（教练与可选执教比赛 + 阵型样本）。
   */
  async ingestSquads(opts: {
    codes: string[];
    delayBetweenTeamMs: number;
    delayBetweenPersonMs: number;
    enrichPerson: boolean;
    enrichCoach: boolean;
    coachMatchDetailSample: number;
    updateTeamMeta: boolean;
  }): Promise<Record<string, unknown>> {
    const codes = opts.codes.filter((c) =>
      FOOTBALL_DATA_COMPETITION_CODES.includes(
        c as (typeof FOOTBALL_DATA_COMPETITION_CODES)[number],
      ),
    );
    const http = this.http();
    const out: Record<string, unknown> = {};
    for (const code of codes) {
      const codeSummary: IngestCodeSummary = {
        teamsSeen: 0,
        teamsFetched: 0,
        playersUpserted: 0,
        personEnriched: 0,
        coachProfilesWritten: 0,
        warnings: [],
        errors: [],
      };
      try {
        const listRes = await http.get(`/competitions/${encodeURIComponent(code)}/teams`);
        await this.logApi(`/competitions/${code}/teams`, listRes.status, true);
        const teams = (listRes.data as { teams?: { id?: number }[] }).teams ?? [];
        codeSummary.teamsSeen = teams.length;
        for (const t of teams) {
          const fdTeamId = t?.id;
          if (fdTeamId == null || !Number.isFinite(Number(fdTeamId))) continue;
          try {
            await sleep(Math.max(0, opts.delayBetweenTeamMs));
            const detailRes = await http.get(`/teams/${encodeURIComponent(String(fdTeamId))}`);
            await this.logApi(`/teams/${fdTeamId}`, detailRes.status, true);
            const detail = detailRes.data as FdTeamDetail;
            codeSummary.teamsFetched += 1;
            const dbTeam = await this.footballData.upsertTeamFromFdForIngest({
              id: detail.id ?? Number(fdTeamId),
              name: detail.name,
              shortName: detail.shortName,
              crest: detail.crest,
            });
            const coachProfile = await this.buildCoachProfile(
              http,
              detail,
              dbTeam.id,
              Number(detail.id ?? fdTeamId),
              code,
              {
                delayBetweenPersonMs: opts.delayBetweenPersonMs,
                enrichCoach: opts.enrichCoach,
                coachMatchDetailSample: opts.coachMatchDetailSample,
              },
              codeSummary,
            );
            await this.prisma.team.update({
              where: { id: dbTeam.id },
              data: {
                ...(opts.updateTeamMeta ?
                  {
                    ...(typeof detail.founded === 'number' ? { founded: detail.founded } : {}),
                    ...(typeof detail.venue === 'string' && detail.venue.trim()
                      ? { venue: detail.venue.trim() }
                      : {}),
                    ...(typeof detail.website === 'string' && detail.website.trim()
                      ? { website: detail.website.trim() }
                      : {}),
                  }
                : {}),
                coachProfile,
              },
            });
            const squad = detail.squad ?? [];
            for (const member of squad) {
              const pid = member.id != null ? Number(member.id) : NaN;
              if (!Number.isFinite(pid)) continue;
              const nameEn =
                typeof member.name === 'string' && member.name.trim()
                  ? member.name.trim()
                  : [member.firstName, member.lastName].filter(Boolean).join(' ').trim() ||
                    `FD#${pid}`;
              let fdPerson: unknown = undefined;
              let fdPersonMatches: unknown = undefined;
              if (opts.enrichPerson) {
                try {
                  await sleep(Math.max(0, opts.delayBetweenPersonMs));
                  const pRes = await http.get(`/persons/${encodeURIComponent(String(pid))}`);
                  await this.logApi(`/persons/${pid}`, pRes.status, true);
                  fdPerson = pRes.data;
                  codeSummary.personEnriched += 1;
                  try {
                    await sleep(Math.max(0, opts.delayBetweenPersonMs));
                    const mRes = await http.get(
                      `/persons/${encodeURIComponent(String(pid))}/matches`,
                      { params: { limit: 15 } },
                    );
                    await this.logApi(`/persons/${pid}/matches`, mRes.status, true);
                    const md = mRes.data as {
                      aggregations?: unknown;
                      resultSet?: unknown;
                      matches?: unknown[];
                    };
                    fdPersonMatches = {
                      ingestedAt: new Date().toISOString(),
                      aggregations: md.aggregations ?? null,
                      resultSet: md.resultSet ?? null,
                      matchSample:
                        Array.isArray(md.matches) ?
                          md.matches.slice(0, 8).map((m) => {
                            const row = m as Record<string, unknown>;
                            return {
                              id: row.id,
                              utcDate: row.utcDate,
                              status: row.status,
                              competition: (row.competition as { name?: string })?.name,
                            };
                          })
                        : [],
                    };
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    codeSummary.warnings.push(`person ${pid} matches: ${msg}`);
                  }
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  codeSummary.warnings.push(`person ${pid}: ${msg}`);
                }
              }
              const fdSquadPatch = {
                lastIngestedAt: new Date().toISOString(),
                fromCompetitionCode: code,
                fdTeamId: Number(detail.id ?? fdTeamId),
                raw: member as Prisma.InputJsonValue,
              };
              const extId = String(pid);
              const existing = await this.prisma.player.findFirst({
                where: { externalId: extId },
                select: {
                  id: true,
                  nameCn: true,
                  nameEn: true,
                  profile: true,
                  teamId: true,
                  avatarUrl: true,
                },
              });
              const mappedCn = resolveFdPersonNameCn(extId, nameEn);
              const preserveCn =
                mappedCn === nameEn &&
                !!existing?.nameCn?.trim() &&
                existing.nameCn.trim() !== (existing.nameEn || '').trim();
              const nameCn = mappedCn !== nameEn ? mappedCn : preserveCn ? existing!.nameCn : nameEn;
              const scrapedAvatar =
                pickFirstHttpImageUrlFromUnknown(member) ??
                pickFirstHttpImageUrlFromUnknown(fdPerson);
              const avatarUrl =
                resolveFdPersonAvatarUrl(extId) ??
                scrapedAvatar ??
                existing?.avatarUrl ??
                null;
              const position =
                typeof member.position === 'string' && member.position.trim() ?
                  member.position.trim()
                : null;
              const nationality =
                typeof member.nationality === 'string' && member.nationality.trim() ?
                  member.nationality.trim()
                : null;
              const shirtNumber =
                member.shirtNumber != null && Number.isFinite(Number(member.shirtNumber)) ?
                  Number(member.shirtNumber)
                : null;
              const nextProfile = mergePlayerProfile(
                existing?.profile,
                fdSquadPatch,
                fdPerson,
                fdPersonMatches,
              );
              if (existing) {
                await this.prisma.player.update({
                  where: { id: existing.id },
                  data: {
                    teamId: dbTeam.id,
                    nameEn,
                    nameCn,
                    position,
                    nationality,
                    shirtNumber,
                    dataSource: DataSourceType.FOOTBALL_DATA,
                    profile: nextProfile,
                    ...(avatarUrl != null ? { avatarUrl } : {}),
                  },
                });
              } else {
                await this.prisma.player.create({
                  data: {
                    teamId: dbTeam.id,
                    externalId: extId,
                    nameCn,
                    nameEn,
                    position,
                    nationality,
                    shirtNumber,
                    dataSource: DataSourceType.FOOTBALL_DATA,
                    profile: nextProfile,
                    avatarUrl,
                  },
                });
              }
              codeSummary.playersUpserted += 1;
            }
          } catch (e: unknown) {
            const ax = axios.isAxiosError(e) ? e : null;
            const msg = ax
              ? JSON.stringify(ax.response?.data || ax.message)
              : String(e);
            codeSummary.errors.push(`team ${fdTeamId}: ${msg}`);
            await this.logApi(
              `/teams/${fdTeamId}`,
              ax?.response?.status ?? null,
              false,
              msg.slice(0, 500),
            );
          }
        }
      } catch (e: unknown) {
        const ax = axios.isAxiosError(e) ? e : null;
        const msg = ax ? JSON.stringify(ax.response?.data || ax.message) : String(e);
        codeSummary.errors.push(`competition ${code}: ${msg}`);
        await this.logApi(
          `/competitions/${code}/teams`,
          ax?.response?.status ?? null,
          false,
          msg.slice(0, 500),
        );
      }
      out[code] = codeSummary;
    }
    return out;
  }
}
