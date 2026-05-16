import { BadRequestException } from '@nestjs/common';
import {
  DataQuality,
  DataSourceType,
  MatchStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { AxiosInstance } from 'axios';
import { resolveFdPersonAvatarUrl, resolveFdPersonNameCn } from '../common/constants/football-data-person-display';
import { pickFirstHttpImageUrlFromUnknown } from '../common/utils/fd-image-url.util';

const MAX_FD_FINISHED_SAMPLES = 8;

export type MatchFdIntelSyncResult = {
  matchId: string;
  footballDataMatchId: string;
  matchBasicsUpdated: boolean;
  refereeSnapshotUpdated: boolean;
  leagueBenchmarkSampleSize: number | null;
  venueHistoricalSampleSize: number | null;
  refereeHomeAwaySamplesWritten: boolean;
  lineupLaboratoryWritten: boolean;
  warnings: string[];
};

function jsonForPrisma(
  v: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (v == null) return undefined;
  return v as Prisma.InputJsonValue;
}

function pickMainReferee(
  referees: unknown,
): { id: number; name: string; nationality: string | null; imageUrl: string | null } | null {
  if (!Array.isArray(referees)) return null;
  for (const r of referees) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (o.type === 'REFEREE' && o.id != null && o.name != null) {
      const id = Number(o.id);
      const name = String(o.name);
      if (Number.isFinite(id) && name.length > 0) {
        return {
          id,
          name,
          nationality: o.nationality == null ? null : String(o.nationality),
          imageUrl: pickFirstHttpImageUrlFromUnknown(o),
        };
      }
    }
  }
  return null;
}

function fdStatusToMatchStatus(raw: string | undefined): MatchStatus {
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

function readTeamStats(side: unknown): {
  yellow: number;
  red: number;
  fouls: number;
} {
  if (!side || typeof side !== 'object') return { yellow: 0, red: 0, fouls: 0 };
  const st = (side as { statistics?: Record<string, unknown> }).statistics;
  if (!st || typeof st !== 'object') return { yellow: 0, red: 0, fouls: 0 };
  const yellow = Number(st.yellow_cards ?? 0) || 0;
  const red =
    (Number(st.red_cards ?? 0) || 0) + (Number(st.yellow_red_cards ?? 0) || 0);
  const fouls = Number(st.fouls ?? 0) || 0;
  return { yellow, red, fouls };
}

async function fetchJson(http: AxiosInstance, url: string): Promise<unknown> {
  const { data } = await http.get(url);
  return data;
}

/** 同联赛已完赛抽样：拉取单场详情，累计出牌与犯规（仅当 FD 返回 statistics） */
async function sampleLeagueCardAverages(
  http: AxiosInstance,
  competitionCode: string,
  excludeFdMatchId: string,
  warnings: string[],
): Promise<Record<string, unknown> | null> {
  const to = new Date();
  const from = new Date(to.getTime() - 370 * 86400000);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);
  let list: unknown;
  try {
    list = await fetchJson(
      http,
      `/competitions/${encodeURIComponent(competitionCode)}/matches?status=FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}&limit=40`,
    );
  } catch {
    warnings.push('FD 联赛已赛场次列表拉取失败，跳过联赛出牌样本');
    return null;
  }
  const matches = (list as { matches?: unknown[] }).matches ?? [];
  const ids: number[] = [];
  for (const m of matches) {
    if (!m || typeof m !== 'object') continue;
    const id = (m as { id?: unknown }).id;
    if (typeof id === 'number' && String(id) !== excludeFdMatchId) {
      ids.push(id);
    }
  }
  const picked = ids.slice(0, MAX_FD_FINISHED_SAMPLES);
  if (picked.length === 0) {
    warnings.push('FD 返回的已赛场次 id 为空，跳过联赛样本');
    return null;
  }

  let n = 0;
  let yellowSum = 0;
  let redSum = 0;
  let foulSum = 0;
  for (const mid of picked) {
    try {
      const detail = await fetchJson(http, `/matches/${mid}`);
      const root = detail as {
        status?: string;
        homeTeam?: unknown;
        awayTeam?: unknown;
      };
      if ((root.status || '').toUpperCase() !== 'FINISHED') continue;
      const h = readTeamStats(root.homeTeam);
      const a = readTeamStats(root.awayTeam);
      if (
        h.yellow + a.yellow + h.red + a.red + h.fouls + a.fouls === 0 &&
        root.homeTeam &&
        root.awayTeam
      ) {
        continue;
      }
      yellowSum += h.yellow + a.yellow;
      redSum += h.red + a.red;
      foulSum += h.fouls + a.fouls;
      n++;
    } catch {
      warnings.push(`FD 单场 ${mid} 详情拉取失败（已跳过）`);
    }
  }
  if (n === 0) {
    warnings.push('抽样场次均无 statistics，未写入联赛对照 JSON');
    return null;
  }
  return {
    sourceMethod: 'FOOTBALL_DATA_COMPETITION_SAMPLE',
    sampleSize: n,
    yellowCardsAvg: yellowSum / n,
    redCardsAvg: redSum / n,
    foulsAvg: foulSum / n,
    notes: `基于 football-data ${competitionCode} 已完赛 ${dateFrom}～${dateTo} 中 ${n} 场单场详情的两队 statistics 合计后再除以场数；非官方「联赛裁判均值」。`,
  };
}

async function computeVenueHistoricalFromDb(
  prisma: PrismaClient,
  matchId: string,
  warnings: string[],
): Promise<Record<string, unknown> | null> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      homeTeamId: true,
      kickoffTime: true,
    },
  });
  if (!m) return null;
  const month = m.kickoffTime.getUTCMonth() + 1;
  const year = m.kickoffTime.getUTCFullYear();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const past = await prisma.match.findMany({
    where: {
      id: { not: m.id },
      homeTeamId: m.homeTeamId,
      status: MatchStatus.FINISHED,
      kickoffTime: { gte: start, lte: end },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { homeScore: true, awayScore: true },
  });
  if (past.length === 0) {
    warnings.push('本库无同主队 UTC 同月已完赛样本，未写入 venueHistoricalContext');
    return null;
  }
  let wins = 0;
  let goals = 0;
  let clean = 0;
  for (const p of past) {
    const hs = p.homeScore!;
    const as = p.awayScore!;
    goals += hs;
    if (hs > as) wins++;
    if (as === 0) clean++;
  }
  const n = past.length;
  return {
    sourceMethod: 'DATABASE_HOME_MONTH',
    windowLabel: `${year}年${month}月（UTC）主队主场已赛`,
    month,
    homeWinRate: wins / n,
    avgGoalsFor: goals / n,
    cleanSheetRate: clean / n,
    sampleSize: n,
    notes: '基于本数据库：同一 homeTeamId、FINISHED、UTC 自然月内主场进球与零封统计。',
  };
}

async function mapFdPlayersToDbSlots(
  prisma: PrismaClient,
  teamId: string,
  lineup: unknown[] | undefined,
  bench: unknown[] | undefined,
): Promise<Array<{ playerId: string; displayName?: string; role?: string }>> {
  const out: Array<{ playerId: string; displayName?: string; role?: string }> = [];
  const rows = [...(lineup ?? []), ...(bench ?? [])];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const fdId = o.id != null ? String(o.id) : null;
    const name = o.name != null ? String(o.name) : undefined;
    const pos = o.position != null ? String(o.position) : undefined;
    if (!fdId) continue;
    const pl = await prisma.player.findFirst({
      where: { teamId, externalId: fdId },
      select: { id: true },
    });
    if (pl) {
      out.push({ playerId: pl.id, displayName: name, role: pos });
    }
  }
  return out;
}

async function buildLineupLaboratoryFromFdDetail(
  prisma: PrismaClient,
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  homeTeam: unknown,
  awayTeam: unknown,
): Promise<Record<string, unknown> | null> {
  const ht = homeTeam as {
    lineup?: unknown[];
    bench?: unknown[];
  };
  const at = awayTeam as {
    lineup?: unknown[];
    bench?: unknown[];
  };
  const homeXi = await mapFdPlayersToDbSlots(prisma, homeTeamId, ht.lineup, ht.bench);
  const awayXi = await mapFdPlayersToDbSlots(prisma, awayTeamId, at.lineup, at.bench);
  if (homeXi.length === 0 && awayXi.length === 0) {
    return null;
  }
  const lineups: Record<string, unknown>[] = [];
  if (homeXi.length) {
    lineups.push({
      id: `fd-home-${matchId}`,
      name: '主队 · Football-Data 大名单',
      startingXi: homeXi.slice(0, 11),
      bench: homeXi.length > 11 ? homeXi.slice(11) : undefined,
      rationale: '球员与 FD lineup/bench 的 externalId 映射；无 FPL 价格。',
    });
  }
  if (awayXi.length) {
    lineups.push({
      id: `fd-away-${matchId}`,
      name: '客队 · Football-Data 大名单',
      startingXi: awayXi.slice(0, 11),
      bench: awayXi.length > 11 ? awayXi.slice(11) : undefined,
      rationale: '同上。',
    });
  }
  if (lineups.length === 0) return null;
  return {
    schemaVersion: 1,
    budgetCap: 0,
    budgetUnit: 'FOOTBALL_DATA_LINEUP',
    summary: '来自 Football-Data 当场阵容接口；非 Fantasy 游戏预算。playerId 为本库 Player（externalId 与 FD 对齐时方可映射）。',
    lineups,
  };
}

/**
 * 从 football-data 拉取单场详情并写入可验证字段；联赛样本为同 code 已完赛抽样。
 * 不调用 LLM 编造数字；无法从 FD/本库得到的数据保持 null 并在 warnings 中说明。
 */
export async function syncMatchIntelFromFootballData(
  prisma: PrismaClient,
  http: AxiosInstance,
  matchId: string,
): Promise<MatchFdIntelSyncResult> {
  const warnings: string[] = [];
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      competition: true,
      homeTeam: true,
      awayTeam: true,
    },
  });
  if (!m?.externalId) {
    throw new BadRequestException('比赛缺少 football-data externalId，请先同步赛程');
  }
  if (m.externalId.startsWith('af-f-')) {
    throw new BadRequestException(
      '本场为 API-Football 主链（externalId 以 af-f- 开头）：请使用 POST /football-data/sync/match/:id/af-facts 或情报管线 af_match_facts，勿调用 Football-Data intel',
    );
  }
  if (!m.competition?.code) {
    throw new BadRequestException('赛事实例缺少 code');
  }
  const extId = m.externalId;
  const detail = (await fetchJson(http, `/matches/${encodeURIComponent(extId)}`)) as Record<
    string,
    unknown
  >;

  const statusStr = typeof detail.status === 'string' ? detail.status : undefined;
  const venue = typeof detail.venue === 'string' ? detail.venue : null;
  const score = detail.score as
    | { fullTime?: { home?: number | null; away?: number | null } }
    | undefined;
  const homeFt = score?.fullTime?.home;
  const awayFt = score?.fullTime?.away;

  const matchUpdate: Prisma.MatchUpdateInput = {
    status: fdStatusToMatchStatus(statusStr),
    dataSource: DataSourceType.FOOTBALL_DATA,
    ...(venue ? { stadium: venue } : {}),
    ...(score?.fullTime &&
    ('home' in score.fullTime || 'away' in score.fullTime)
      ? {
          homeScore: homeFt ?? null,
          awayScore: awayFt ?? null,
        }
      : {}),
  };
  await prisma.match.update({
    where: { id: matchId },
    data: matchUpdate,
  });

  const mainRef = pickMainReferee(detail.referees);
  let refereeSnapshotUpdated = false;
  let leagueBenchmarkSampleSize: number | null = null;
  const refereeHomeAwaySamplesWritten = false;

  const leagueSample = await sampleLeagueCardAverages(
    http,
    m.competition.code,
    extId,
    warnings,
  );
  if (leagueSample && typeof leagueSample.sampleSize === 'number') {
    leagueBenchmarkSampleSize = leagueSample.sampleSize as number;
  }

  const hst = readTeamStats(detail.homeTeam);
  const ast = readTeamStats(detail.awayTeam);
  const fixY = hst.yellow + ast.yellow;
  const fixF = hst.fouls + ast.fouls;
  let leagueBenchmarks: Record<string, unknown> | null = leagueSample
    ? { ...leagueSample }
    : null;
  if (fixY > 0 || fixF > 0) {
    const baseNote =
      fixY || fixF
        ? `本场 FD statistics：两队黄牌合计 ${fixY}、犯规合计 ${fixF}。`
        : '';
    if (leagueBenchmarks) {
      leagueBenchmarks = {
        ...leagueBenchmarks,
        thisFixtureYellowTotal: fixY,
        thisFixtureFoulsTotal: fixF,
        notes: [leagueBenchmarks.notes, baseNote].filter(Boolean).join('\n'),
      };
    } else {
      leagueBenchmarks = {
        sourceMethod: 'FOOTBALL_DATA_SINGLE_MATCH',
        thisFixtureYellowTotal: fixY,
        thisFixtureFoulsTotal: fixF,
        notes: `${baseNote}暂无同联赛已赛抽样（或抽样无 statistics）。`,
      };
    }
  }

  if (mainRef) {
    const extRef = String(mainRef.id);
    const nameEn = mainRef.name;
    const nameCn = resolveFdPersonNameCn(extRef, nameEn);
    const prev = await prisma.referee.findUnique({
      where: { externalId: extRef },
      select: { avatarUrl: true },
    });
    const avatarUrl =
      resolveFdPersonAvatarUrl(extRef) ?? mainRef.imageUrl ?? prev?.avatarUrl ?? null;
    const refereeRow = await prisma.referee.upsert({
      where: { externalId: extRef },
      create: {
        externalId: extRef,
        nameCn,
        nameEn,
        avatarUrl,
        country: mainRef.nationality,
        dataSource: DataSourceType.FOOTBALL_DATA,
      },
      update: {
        nameCn,
        nameEn,
        ...(avatarUrl != null ? { avatarUrl } : {}),
        country: mainRef.nationality ?? undefined,
        dataSource: DataSourceType.FOOTBALL_DATA,
      },
    });

    await prisma.refereeSnapshot.upsert({
      where: { matchId },
      create: {
        matchId,
        refereeId: refereeRow.id,
        dataSource: DataSourceType.FOOTBALL_DATA,
        dataQuality: DataQuality.PUBLIC_DATA,
        leagueBenchmarks: jsonForPrisma(leagueBenchmarks),
      },
      update: {
        refereeId: refereeRow.id,
        leagueBenchmarks: jsonForPrisma(leagueBenchmarks),
        homeTeamRefHistory: Prisma.JsonNull,
        awayTeamRefHistory: Prisma.JsonNull,
        dataSource: DataSourceType.FOOTBALL_DATA,
        dataQuality: DataQuality.PUBLIC_DATA,
      },
    });
    refereeSnapshotUpdated = true;
  } else {
    warnings.push('FD 本场未返回 type=REFEREE 的裁判，未更新 RefereeSnapshot');
    if (leagueBenchmarks) {
      warnings.push('有联赛/本场统计但无裁判，未写入 RefereeSnapshot（避免孤儿行）');
    }
  }

  warnings.push(
    '「裁判执法某队历史」需可验证的逐场裁判标注数据源；当前未写入 homeTeamRefHistory/awayTeamRefHistory，避免误用 Person matches。',
  );

  const venueHist = await computeVenueHistoricalFromDb(prisma, matchId, warnings);
  let venueHistoricalSampleSize: number | null = null;
  if (venueHist && typeof venueHist.sampleSize === 'number') {
    venueHistoricalSampleSize = venueHist.sampleSize as number;
  }
  await prisma.weatherSnapshot.upsert({
    where: { matchId },
    create: {
      matchId,
      venueHistoricalContext: jsonForPrisma(venueHist),
      dataSource: DataSourceType.MANUAL,
      dataQuality: venueHist ? DataQuality.PUBLIC_DATA : DataQuality.UNKNOWN,
    },
    update: {
      venueHistoricalContext: jsonForPrisma(venueHist),
    },
  });

  const lab = await buildLineupLaboratoryFromFdDetail(
    prisma,
    matchId,
    m.homeTeam.id,
    m.awayTeam.id,
    detail.homeTeam,
    detail.awayTeam,
  );
  const lineupLaboratoryWritten = !!lab;
  if (lab) {
    await prisma.fantasyAdvice.upsert({
      where: { matchId },
      create: {
        matchId,
        lineupLaboratory: jsonForPrisma(lab),
        dataSource: DataSourceType.FOOTBALL_DATA,
        dataQuality: DataQuality.PUBLIC_DATA,
      },
      update: {
        lineupLaboratory: jsonForPrisma(lab),
      },
    });
  }

  return {
    matchId,
    footballDataMatchId: extId,
    matchBasicsUpdated: true,
    refereeSnapshotUpdated,
    leagueBenchmarkSampleSize,
    venueHistoricalSampleSize,
    refereeHomeAwaySamplesWritten,
    lineupLaboratoryWritten,
    warnings,
  };
}
