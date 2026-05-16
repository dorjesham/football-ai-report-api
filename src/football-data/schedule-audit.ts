import type { PrismaClient } from '@prisma/client';
import { MatchStatus } from '@prisma/client';
import type { AxiosInstance } from 'axios';

export type FdTeamLite = {
  id?: number;
  name?: string;
  shortName?: string;
  tla?: string;
};

export type FdMatchLite = {
  id?: number;
  utcDate?: string;
  status?: string;
  homeTeam?: FdTeamLite;
  awayTeam?: FdTeamLite;
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
  };
};

export function wcCodeFromTeamExternalId(ext: string | null | undefined): string | null {
  if (!ext) return null;
  const m = /^wc26-([A-Z0-9]{2,4})$/i.exec(ext.trim());
  return m ? m[1].toUpperCase() : null;
}

export function mapFdMatchStatusToPrisma(raw: string | undefined): MatchStatus {
  switch ((raw || '').toUpperCase()) {
    case 'FINISHED':
      return MatchStatus.FINISHED;
    case 'LIVE':
    case 'IN_PLAY':
    case 'PAUSED':
      return MatchStatus.LIVE;
    case 'TIMED':
      return MatchStatus.SCHEDULED;
    case 'POSTPONED':
      return MatchStatus.POSTPONED;
    case 'CANCELLED':
    case 'SUSPENDED':
      return MatchStatus.CANCELLED;
    default:
      return MatchStatus.SCHEDULED;
  }
}

function fdTeamKey(team: FdTeamLite | undefined, fdIdToTla: Map<number, string>): string | null {
  if (!team?.id) return null;
  const fromMap = fdIdToTla.get(team.id);
  if (fromMap) return fromMap;
  const tla = team.tla?.trim().toUpperCase();
  if (tla) return tla;
  return null;
}

export async function fetchFdTeamsForCompetition(
  http: AxiosInstance,
  code: string,
): Promise<Map<number, string>> {
  const fdIdToTla = new Map<number, string>();
  try {
    const { data } = await http.get(`/competitions/${code}/teams`);
    const teams = (data as { teams?: FdTeamLite[] }).teams ?? [];
    for (const t of teams) {
      if (t.id == null) continue;
      const k = (t.tla || '').trim().toUpperCase();
      if (k) fdIdToTla.set(t.id, k);
    }
  } catch {
    /* 无 teams 时仅靠赛程内队伍字段 */
  }
  return fdIdToTla;
}

export async function fetchFdMatchesWindow(
  http: AxiosInstance,
  code: string,
  dateFrom: string,
  dateTo: string,
): Promise<FdMatchLite[]> {
  const { data } = await http.get(`/competitions/${code}/matches`, {
    params: { dateFrom, dateTo, limit: 500 },
  });
  return (data as { matches?: FdMatchLite[] }).matches ?? [];
}

export type WcPairAuditRow = {
  dbId: string;
  pair: string;
  dbKickoffIso: string;
  fdKickoffIso: string | null;
  kickoffDeltaMin: number | null;
  dbScore: string;
  fdScore: string | null;
  dbStatus: string;
  fdStatus: string | null;
  okKickoff: boolean;
  okScore: boolean;
  okStatus: boolean;
  note: string;
};

export type WcPairAuditReport = {
  summary: {
    competitionId: string;
    fdCode: string;
    dateFrom: string;
    dateTo: string;
    dbMatchCount: number;
    fdMatchCountInWindow: number;
    fdIndexedPairs: number;
    fdMissingPairs: number;
    fdOnlyInApiCount: number;
    kickoffMismatch: number;
    scoreMismatch: number;
    statusMismatch: number;
    kickoffToleranceMin: number;
  };
  fdOnlySample: string[];
  rows: WcPairAuditRow[];
};

export async function auditWcScheduleVsFootballData(opts: {
  prisma: PrismaClient;
  http: AxiosInstance;
  competitionId: string;
  fdCode: string;
  dateFrom: string;
  dateTo: string;
  kickoffToleranceMin: number;
}): Promise<WcPairAuditReport> {
  const { prisma, http, competitionId, fdCode, dateFrom, dateTo, kickoffToleranceMin } = opts;

  const fdIdToTla = await fetchFdTeamsForCompetition(http, fdCode);
  const fdMatches = await fetchFdMatchesWindow(http, fdCode, dateFrom, dateTo);

  for (const m of fdMatches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (t?.id != null && t.tla) {
        const k = t.tla.trim().toUpperCase();
        if (k) fdIdToTla.set(t.id, k);
      }
    }
  }

  const pairToFd = new Map<string, FdMatchLite>();
  for (const m of fdMatches) {
    const hk = fdTeamKey(m.homeTeam, fdIdToTla);
    const ak = fdTeamKey(m.awayTeam, fdIdToTla);
    if (hk && ak) pairToFd.set(`${hk}-${ak}`, m);
  }

  const dbMatches = await prisma.match.findMany({
    where: { competitionId },
    include: {
      homeTeam: { select: { id: true, externalId: true, nameEn: true } },
      awayTeam: { select: { id: true, externalId: true, nameEn: true } },
    },
    orderBy: { kickoffTime: 'asc' },
  });

  const rows: WcPairAuditRow[] = [];
  let fdMissing = 0;
  let kickoffMismatch = 0;
  let scoreMismatch = 0;
  let statusMismatch = 0;

  for (const m of dbMatches) {
    const hc = wcCodeFromTeamExternalId(m.homeTeam.externalId);
    const ac = wcCodeFromTeamExternalId(m.awayTeam.externalId);
    const pair = hc && ac ? `${hc}-${ac}` : `${m.homeTeam.nameEn} vs ${m.awayTeam.nameEn}`;
    let fd = hc && ac ? pairToFd.get(`${hc}-${ac}`) : undefined;
    let orderNote = '';
    if (hc && ac && !fd) {
      fd = pairToFd.get(`${ac}-${hc}`);
      if (fd) orderNote = 'FD_REVERSED_HOME_AWAY';
    }

    if (!hc || !ac) {
      rows.push({
        dbId: m.id,
        pair,
        dbKickoffIso: m.kickoffTime.toISOString(),
        fdKickoffIso: null,
        kickoffDeltaMin: null,
        dbScore: `${m.homeScore ?? '—'}:${m.awayScore ?? '—'}`,
        fdScore: null,
        dbStatus: m.status,
        fdStatus: null,
        okKickoff: false,
        okScore: false,
        okStatus: false,
        note: 'SKIP_NON_WC26_TEAM_CODES',
      });
      continue;
    }

    if (!fd) {
      fdMissing += 1;
      rows.push({
        dbId: m.id,
        pair: `${hc}-${ac}`,
        dbKickoffIso: m.kickoffTime.toISOString(),
        fdKickoffIso: null,
        kickoffDeltaMin: null,
        dbScore: `${m.homeScore ?? '—'}:${m.awayScore ?? '—'}`,
        fdScore: null,
        dbStatus: m.status,
        fdStatus: null,
        okKickoff: false,
        okScore: false,
        okStatus: false,
        note: 'FD_MISSING_PAIR',
      });
      continue;
    }

    const fdUtc = fd.utcDate ? new Date(String(fd.utcDate)) : null;
    const deltaMin =
      fdUtc && !Number.isNaN(fdUtc.getTime())
        ? Math.round((m.kickoffTime.getTime() - fdUtc.getTime()) / 60000)
        : null;
    const okKickoff = deltaMin != null && Math.abs(deltaMin) <= kickoffToleranceMin;

    const fthRaw = fd.score?.fullTime?.home;
    const ftaRaw = fd.score?.fullTime?.away;
    const fth = orderNote ? ftaRaw : fthRaw;
    const fta = orderNote ? fthRaw : ftaRaw;
    const fdScoreStr = fth != null && fta != null ? `${fth}:${fta}` : '—:—';
    const dbHs = m.homeScore;
    const dbAs = m.awayScore;
    const okScore =
      fth == null && fta == null ? dbHs == null && dbAs == null : dbHs === fth && dbAs === fta;
    if (!okScore) scoreMismatch += 1;

    const fdSt = mapFdMatchStatusToPrisma(fd.status);
    const okStatus = fdSt === m.status;
    if (!okStatus) statusMismatch += 1;
    if (!okKickoff) kickoffMismatch += 1;

    const baseNote = okKickoff && okScore && okStatus ? 'OK' : 'MISMATCH';
    rows.push({
      dbId: m.id,
      pair: `${hc}-${ac}`,
      dbKickoffIso: m.kickoffTime.toISOString(),
      fdKickoffIso: fdUtc ? fdUtc.toISOString() : null,
      kickoffDeltaMin: deltaMin,
      dbScore: `${dbHs ?? '—'}:${dbAs ?? '—'}`,
      fdScore: fdScoreStr,
      dbStatus: m.status,
      fdStatus: fd.status ?? null,
      okKickoff,
      okScore,
      okStatus,
      note: orderNote ? `${baseNote};${orderNote}` : baseNote,
    });
  }

  const fdOnlyPairs = new Set(pairToFd.keys());
  for (const m of dbMatches) {
    const hc = wcCodeFromTeamExternalId(m.homeTeam.externalId);
    const ac = wcCodeFromTeamExternalId(m.awayTeam.externalId);
    if (hc && ac) fdOnlyPairs.delete(`${hc}-${ac}`);
  }

  return {
    summary: {
      competitionId,
      fdCode,
      dateFrom,
      dateTo,
      dbMatchCount: dbMatches.length,
      fdMatchCountInWindow: fdMatches.length,
      fdIndexedPairs: pairToFd.size,
      fdMissingPairs: fdMissing,
      fdOnlyInApiCount: fdOnlyPairs.size,
      kickoffMismatch,
      scoreMismatch,
      statusMismatch,
      kickoffToleranceMin,
    },
    fdOnlySample: [...fdOnlyPairs].slice(0, 30),
    rows,
  };
}

export type FdExternalIdAuditRow = {
  dbId: string;
  externalId: string;
  pair: string;
  dbKickoffIso: string;
  fdKickoffIso: string | null;
  kickoffDeltaMin: number | null;
  dbScore: string;
  fdScore: string | null;
  dbStatus: string;
  fdStatus: string | null;
  okKickoff: boolean;
  okScore: boolean;
  okStatus: boolean;
  note: string;
};

export type FdExternalIdAuditReport = {
  summary: {
    competitionId: string;
    mode: 'fd-external-id';
    dbWithNumericExternalId: number;
    fetchErrors: number;
    kickoffToleranceMin: number;
  };
  rows: FdExternalIdAuditRow[];
};

export async function auditMatchesByFdExternalId(opts: {
  prisma: PrismaClient;
  http: AxiosInstance;
  competitionId: string;
  kickoffToleranceMin: number;
}): Promise<FdExternalIdAuditReport> {
  const { prisma, http, competitionId, kickoffToleranceMin } = opts;

  const dbMatches = await prisma.match.findMany({
    where: {
      competitionId,
      externalId: { not: null },
    },
    include: {
      homeTeam: { select: { nameEn: true } },
      awayTeam: { select: { nameEn: true } },
    },
  });

  const numeric = dbMatches.filter((m) => m.externalId && /^\d+$/.test(m.externalId));

  const rows: FdExternalIdAuditRow[] = [];
  let fetchErr = 0;

  for (const m of numeric) {
    let fd: FdMatchLite | null = null;
    try {
      const { data } = await http.get(`/matches/${m.externalId}`);
      fd = data as FdMatchLite;
    } catch {
      fetchErr += 1;
      rows.push({
        dbId: m.id,
        externalId: m.externalId!,
        pair: `${m.homeTeam.nameEn} vs ${m.awayTeam.nameEn}`,
        dbKickoffIso: m.kickoffTime.toISOString(),
        fdKickoffIso: null,
        kickoffDeltaMin: null,
        dbScore: `${m.homeScore ?? '—'}:${m.awayScore ?? '—'}`,
        fdScore: null,
        dbStatus: m.status,
        fdStatus: null,
        okKickoff: false,
        okScore: false,
        okStatus: false,
        note: 'FD_FETCH_FAILED',
      });
      continue;
    }

    const fdUtc = fd?.utcDate ? new Date(String(fd.utcDate)) : null;
    const deltaMin =
      fdUtc && !Number.isNaN(fdUtc.getTime())
        ? Math.round((m.kickoffTime.getTime() - fdUtc.getTime()) / 60000)
        : null;
    const okKickoff = deltaMin != null && Math.abs(deltaMin) <= kickoffToleranceMin;

    const fth = fd?.score?.fullTime?.home;
    const fta = fd?.score?.fullTime?.away;
    const fdScoreStr = fth != null && fta != null ? `${fth}:${fta}` : '—:—';
    const okScore =
      fth == null && fta == null
        ? m.homeScore == null && m.awayScore == null
        : m.homeScore === fth && m.awayScore === fta;
    const fdSt = mapFdMatchStatusToPrisma(fd?.status);
    const okStatus = fdSt === m.status;

    rows.push({
      dbId: m.id,
      externalId: m.externalId!,
      pair: `${m.homeTeam.nameEn} vs ${m.awayTeam.nameEn}`,
      dbKickoffIso: m.kickoffTime.toISOString(),
      fdKickoffIso: fdUtc ? fdUtc.toISOString() : null,
      kickoffDeltaMin: deltaMin,
      dbScore: `${m.homeScore ?? '—'}:${m.awayScore ?? '—'}`,
      fdScore: fdScoreStr,
      dbStatus: m.status,
      fdStatus: fd?.status ?? null,
      okKickoff,
      okScore,
      okStatus,
      note: okKickoff && okScore && okStatus ? 'OK' : 'MISMATCH',
    });
  }

  return {
    summary: {
      competitionId,
      mode: 'fd-external-id',
      dbWithNumericExternalId: numeric.length,
      fetchErrors: fetchErr,
      kickoffToleranceMin,
    },
    rows,
  };
}
