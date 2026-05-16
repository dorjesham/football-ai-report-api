import { asRecord } from '../api-football/af-fixture-match-fields.util';
import type { LiveEventV1 } from './live-event.types';
import { liveEventDedupKey } from './live-event-dedup.util';

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function teamSideFromIds(
  teamId: number | null,
  homeTeamId: number | null,
  awayTeamId: number | null,
): 'home' | 'away' | null {
  if (teamId == null) return null;
  if (homeTeamId != null && teamId === homeTeamId) return 'home';
  if (awayTeamId != null && teamId === awayTeamId) return 'away';
  return null;
}

/** AF GET /fixtures/events response[] → LiveEventV1 */
export function normalizeAfEvents(
  raw: unknown,
  opts?: { homeTeamId?: number | null; awayTeamId?: number | null },
): LiveEventV1[] {
  const arr = Array.isArray(raw) ? raw : [];
  const homeTeamId = opts?.homeTeamId ?? null;
  const awayTeamId = opts?.awayTeamId ?? null;
  const out: LiveEventV1[] = [];

  for (const row of arr) {
    const r = asRecord(row);
    if (!r) continue;
    const time = asRecord(r.time);
    const minute = num(time?.elapsed);
    const extraMinute = num(time?.extra);
    const team = asRecord(r.team);
    const teamId = num(team?.id);
    const player = asRecord(r.player);
    const assist = asRecord(r.assist);
    const type = String(r.type ?? 'Unknown');
    const detail = r.detail != null ? String(r.detail) : null;
    const teamSide = teamSideFromIds(teamId, homeTeamId, awayTeamId);
    const playerName =
      typeof player?.name === 'string' ? player.name
      : player?.name != null ? String(player.name)
      : null;
    const assistName =
      typeof assist?.name === 'string' ? assist.name
      : assist?.name != null ? String(assist.name)
      : null;
    const teamName =
      typeof team?.name === 'string' ? team.name
      : team?.name != null ? String(team.name)
      : null;

    const item: LiveEventV1 = {
      id: '',
      source: 'API_FOOTBALL',
      minute,
      extraMinute,
      type,
      detail,
      teamSide,
      teamName,
      playerName,
      assistName,
    };
    item.id = liveEventDedupKey(item);
    out.push(item);
  }
  return out;
}
