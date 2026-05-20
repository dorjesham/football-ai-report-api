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

export type NormalizedStandingsGroup = {
  groupName: string;
  rows: NormalizedStandingRow[];
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

function groupLabelFromTier(
  tier: unknown[],
  tierIndex: number,
  sampleRow: Record<string, unknown> | null,
): string {
  const fromRow =
    (typeof sampleRow?.group === 'string' && sampleRow.group.trim()) ||
    (typeof sampleRow?.groupName === 'string' && sampleRow.groupName.trim()) ||
    '';
  if (fromRow) return fromRow;
  if (tier.length > 0 && tierIndex > 0) return `Group ${String.fromCharCode(65 + tierIndex)}`;
  return '';
}

function mapTier(tier: unknown[], tierIndex: number): NormalizedStandingRow[] {
  const rows: NormalizedStandingRow[] = [];
  for (const item of tier) {
    const rec = asRecord(item);
    if (!rec) continue;
    const mapped = mapOneRow(rec);
    if (mapped) rows.push(mapped);
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

/** 多组杯赛（世界杯等）按 groupName 拆分；联赛单表 groupName 为 '' */
export function normalizeApiFootballStandingsGroups(
  response: unknown[],
): NormalizedStandingsGroup[] {
  const groups: NormalizedStandingsGroup[] = [];
  for (const groupWrap of response) {
    const gRec = asRecord(groupWrap);
    const league = asRecord(gRec?.league);
    const standings = league?.standings;
    if (!Array.isArray(standings)) continue;
    for (let ti = 0; ti < standings.length; ti++) {
      const tier = standings[ti];
      if (!Array.isArray(tier) || tier.length === 0) continue;
      const rows = mapTier(tier, ti);
      if (!rows.length) continue;
      const groupName = groupLabelFromTier(tier, ti, asRecord(tier[0]));
      groups.push({
        groupName,
        rows,
      });
    }
  }
  if (groups.length === 0) return [];
  if (groups.length === 1 && !groups[0]!.groupName) {
    return [{ groupName: '', rows: groups[0]!.rows }];
  }
  return groups;
}

/** 扁平化：多组时合并（联赛 API 单表兼容） */
export function normalizeApiFootballStandingsResponse(
  response: unknown[],
): NormalizedStandingRow[] {
  const groups = normalizeApiFootballStandingsGroups(response);
  if (!groups.length) return [];
  if (groups.length === 1) return groups[0]!.rows;
  return groups.flatMap((g) => g.rows).sort((a, b) => a.rank - b.rank);
}
