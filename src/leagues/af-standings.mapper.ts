import { asRecord } from '../api-football/af-fixture-match-fields.util';

export type NormalizedStandingRow = {
  rank: number;
  teamId: number | null;
  teamName: string;
  teamLogo: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapOneRow(raw: Record<string, unknown>): NormalizedStandingRow | null {
  const team = asRecord(raw.team);
  const all = asRecord(raw.all);
  const goals = asRecord(all?.goals);
  const gf = num(goals?.for, 0);
  const ga = num(goals?.against, 0);
  const teamName =
    (typeof team?.name === 'string' && team.name.trim()) ||
    (typeof raw.teamName === 'string' && raw.teamName.trim()) ||
    '';
  if (!teamName) return null;
  return {
    rank: num(raw.rank, 0),
    teamId: num(team?.id, NaN) || null,
    teamName,
    teamLogo:
      typeof team?.logo === 'string' && team.logo.trim() ? team.logo.trim() : null,
    played: num(all?.played, 0),
    wins: num(all?.win, 0),
    draws: num(all?.draw, 0),
    losses: num(all?.lose, 0),
    goalsFor: gf,
    goalsAgainst: ga,
    goalDifference: num(raw.goalsDiff, gf - ga),
    points: num(raw.points, 0),
  };
}

/** 将 API-Football `/standings` 的 `response` 规范化为 flat rows（多组杯赛取第一组积分榜） */
export function normalizeApiFootballStandingsResponse(
  response: unknown[],
): NormalizedStandingRow[] {
  const rows: NormalizedStandingRow[] = [];
  for (const groupWrap of response) {
    const gRec = asRecord(groupWrap);
    const league = asRecord(gRec?.league);
    const standings = league?.standings;
    if (!Array.isArray(standings)) continue;
    for (const tier of standings) {
      if (!Array.isArray(tier)) continue;
      for (const item of tier) {
        const rec = asRecord(item);
        if (!rec) continue;
        const mapped = mapOneRow(rec);
        if (mapped) rows.push(mapped);
      }
      if (rows.length > 0) return rows.sort((a, b) => a.rank - b.rank);
    }
  }
  return rows.sort((a, b) => a.rank - b.rank);
}
