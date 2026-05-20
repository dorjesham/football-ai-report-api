import { asRecord } from '../api-football/af-fixture-match-fields.util';
import type { MatchPhaseInjuryItem } from '../match-phase/match-phase.types';

export type NormalizedInjuryRow = {
  playerId: number | null;
  playerName: string;
  type: string | null;
  reason: string | null;
  apiTeamId: number | null;
  fixtureId: number | null;
};

function injuryDedupeKey(row: NormalizedInjuryRow): string {
  const playerKey =
    row.playerId != null ? `p:${row.playerId}` : `n:${row.playerName}`;
  return [
    row.fixtureId ?? '',
    row.apiTeamId ?? '',
    playerKey,
    row.type ?? '',
    row.reason ?? '',
  ].join('|');
}

/** 去重：fixtureId + teamId + playerId(+name) + type + reason */
export function dedupeInjuryRows(rows: NormalizedInjuryRow[]): NormalizedInjuryRow[] {
  const seen = new Set<string>();
  const out: NormalizedInjuryRow[] = [];
  for (const row of rows) {
    const key = injuryDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function normalizeInjuriesResponse(response: unknown[]): NormalizedInjuryRow[] {
  const rows: NormalizedInjuryRow[] = [];
  for (const wrap of response) {
    const rec = asRecord(wrap);
    if (!rec) continue;
    const player = asRecord(rec.player);
    const team = asRecord(rec.team);
    const fixture = asRecord(rec.fixture);
    const playerName =
      (typeof player?.name === 'string' && player.name.trim()) || 'Unknown';
    const type =
      typeof player?.type === 'string' ? player.type
      : typeof rec.type === 'string' ? rec.type
      : null;
    const reason =
      typeof player?.reason === 'string' ? player.reason
      : typeof rec.reason === 'string' ? rec.reason
      : typeof rec.detail === 'string' ? rec.detail
      : null;
    const playerId =
      typeof player?.id === 'number' ? player.id
      : typeof player?.id === 'string' ? parseInt(player.id, 10) || null
      : null;
    const fixtureId =
      typeof fixture?.id === 'number' ? fixture.id
      : typeof fixture?.id === 'string' ? parseInt(fixture.id, 10) || null
      : null;
    rows.push({
      playerId: Number.isFinite(playerId as number) ? (playerId as number) : null,
      playerName,
      type,
      reason,
      apiTeamId: Number(team?.id) || null,
      fixtureId,
    });
  }
  return dedupeInjuryRows(rows);
}

export function splitInjuriesBySide(
  rows: NormalizedInjuryRow[],
  homeApiTeamId: number | null,
  awayApiTeamId: number | null,
): { homeInjuries: MatchPhaseInjuryItem[]; awayInjuries: MatchPhaseInjuryItem[] } {
  const homeInjuries: MatchPhaseInjuryItem[] = [];
  const awayInjuries: MatchPhaseInjuryItem[] = [];
  for (const r of rows) {
    const item: MatchPhaseInjuryItem = {
      playerName: r.playerName,
      type: r.type,
      reason: r.reason,
      teamSide: 'home',
    };
    if (homeApiTeamId != null && r.apiTeamId === homeApiTeamId) {
      homeInjuries.push({ ...item, teamSide: 'home' });
    } else if (awayApiTeamId != null && r.apiTeamId === awayApiTeamId) {
      awayInjuries.push({ ...item, teamSide: 'away' });
    } else {
      homeInjuries.push(item);
    }
  }
  return { homeInjuries, awayInjuries };
}
