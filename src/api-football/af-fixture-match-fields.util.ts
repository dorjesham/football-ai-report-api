import { MatchStatus } from '@prisma/client';

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function mapAfFixtureStatus(short: string | undefined): MatchStatus {
  const s = (short || '').toUpperCase();
  if (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(s)) return MatchStatus.FINISHED;
  if (['LIVE', '1H', '2H', 'HT', 'ET', 'P', 'BT', 'INT'].includes(s)) {
    return MatchStatus.LIVE;
  }
  if (['PST', 'TBD'].includes(s)) return MatchStatus.POSTPONED;
  if (['CANC', 'ABD', 'SUSP'].includes(s)) return MatchStatus.CANCELLED;
  return MatchStatus.SCHEDULED;
}

/** 开球时间：优先 ISO `fixture.date`，否则用 Unix 秒 `fixture.timestamp` */
export function parseAfFixtureKickoff(fixture: Record<string, unknown> | null): Date | null {
  if (!fixture) return null;
  const dateStr = String(fixture.date ?? '').trim();
  if (dateStr && dateStr !== 'null' && dateStr !== 'undefined') {
    const fromDate = new Date(dateStr);
    if (!Number.isNaN(fromDate.getTime())) return fromDate;
  }
  const ts = fixture.timestamp;
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return new Date(ts * 1000);
  }
  if (typeof ts === 'string' && /^\d+$/.test(ts)) {
    const n = Number(ts);
    return Number.isFinite(n) ? new Date(n * 1000) : null;
  }
  return null;
}

/** 从 API-Football fixtures 响应单项解析比分、状态、开球、场地 */
export function extractAfFixtureMatchFields(rawItem: unknown): {
  kickoffTime: Date;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  stadium: string | null;
} | null {
  const item = asRecord(rawItem);
  if (!item) return null;
  const fixture = asRecord(item?.fixture);
  const fid = Number(fixture?.id);
  if (!Number.isFinite(fid)) return null;
  const kick = parseAfFixtureKickoff(fixture);
  if (!kick) return null;
  const statusShort = String(asRecord(fixture?.status)?.short ?? '');
  const st = mapAfFixtureStatus(statusShort);
  const goals = asRecord(item?.goals);
  let homeScore: number | null =
    typeof goals?.home === 'number' ? goals.home : null;
  let awayScore: number | null =
    typeof goals?.away === 'number' ? goals.away : null;
  if (homeScore == null || awayScore == null) {
    const ft = asRecord(asRecord(item?.score)?.fulltime);
    if (ft) {
      if (typeof ft.home === 'number') homeScore = ft.home;
      if (typeof ft.away === 'number') awayScore = ft.away;
    }
  }
  const venue = asRecord(fixture?.venue);
  const stadium =
    typeof venue?.name === 'string' && venue.name.trim() ?
      venue.name.trim()
    : null;
  return { kickoffTime: kick, status: st, homeScore, awayScore, stadium };
}

function pickScoreSide(
  block: Record<string, unknown> | null,
  side: 'home' | 'away',
): number | null {
  if (!block) return null;
  const v = block[side];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  return null;
}

/** 半场/全场/加时/点球比分（来自 `score` 对象） */
export function extractAfScoreExtended(rawItem: unknown): {
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  etHome: number | null;
  etAway: number | null;
  penHome: number | null;
  penAway: number | null;
} {
  const z = {
    htHome: null as number | null,
    htAway: null as number | null,
    ftHome: null as number | null,
    ftAway: null as number | null,
    etHome: null as number | null,
    etAway: null as number | null,
    penHome: null as number | null,
    penAway: null as number | null,
  };
  const item = asRecord(rawItem);
  if (!item) return z;
  const score = asRecord(item.score);
  if (!score) return z;
  const hal = asRecord(score.halftime);
  const full = asRecord(score.fulltime);
  const ext = asRecord(score.extratime);
  const pen = asRecord(score.penalty);
  z.htHome = pickScoreSide(hal, 'home');
  z.htAway = pickScoreSide(hal, 'away');
  z.ftHome = pickScoreSide(full, 'home');
  z.ftAway = pickScoreSide(full, 'away');
  z.etHome = pickScoreSide(ext, 'home');
  z.etAway = pickScoreSide(ext, 'away');
  z.penHome = pickScoreSide(pen, 'home');
  z.penAway = pickScoreSide(pen, 'away');
  return z;
}

export function parseAfFixtureIdFromExternalId(externalId: string | null | undefined): number | null {
  if (!externalId) return null;
  const m = /^af-f-(\d+)$/.exec(externalId.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseAfTeamIdFromExternalId(externalId: string | null | undefined): number | null {
  if (!externalId) return null;
  const m = /^af-t-(\d+)$/.exec(externalId.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseAfPlayerIdFromExternalId(externalId: string | null | undefined): number | null {
  if (!externalId) return null;
  const m = /^af-p-(\d+)$/.exec(externalId.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
