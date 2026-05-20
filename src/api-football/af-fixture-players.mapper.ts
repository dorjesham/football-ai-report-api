import { asRecord } from './af-fixture-match-fields.util';

export type AfFixturePlayerStatRow = {
  afPlayerId: number;
  teamSide: 'home' | 'away';
  playerName: string;
  playerNameEn: string | null;
  position: string | null;
  minutes: number | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shotsOn: number | null;
  passes: number | null;
  keyPasses: number | null;
  tackles: number | null;
  duelsWon: number | null;
  saves: number | null;
  yellowCards: number | null;
  redCards: number | null;
  rawJson: Record<string, unknown>;
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function statVal(stats: unknown[], typeNames: string[]): number | null {
  if (!Array.isArray(stats)) return null;
  for (const s of stats) {
    const r = asRecord(s);
    if (!r) continue;
    const t = String(r.type ?? '');
    if (!typeNames.some((n) => t.toLowerCase().includes(n.toLowerCase()))) continue;
    return num(r.value);
  }
  return null;
}

function mapOnePlayer(
  raw: unknown,
  teamSide: 'home' | 'away',
): AfFixturePlayerStatRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  const player = asRecord(row.player);
  const pid = num(player?.id);
  if (pid == null) return null;
  const name =
    typeof player?.name === 'string' && player.name.trim() ? player.name.trim() : null;
  if (!name) return null;
  const statsArr = Array.isArray(row.statistics) ? row.statistics : [];
  const games = asRecord(statsArr[0]);
  const gamesBlock = asRecord(games?.games);
  const minutes = num(gamesBlock?.minutes);

  return {
    afPlayerId: Math.trunc(pid),
    teamSide,
    playerName: name,
    playerNameEn: name,
    position: typeof player?.pos === 'string' ? player.pos : null,
    minutes,
    rating: statVal(statsArr, ['rating']),
    goals: statVal(statsArr, ['goals']),
    assists: statVal(statsArr, ['assists']),
    shots: statVal(statsArr, ['total shots', 'shots total']),
    shotsOn: statVal(statsArr, ['shots on goal', 'shots on target']),
    passes: statVal(statsArr, ['total passes', 'passes total']),
    keyPasses: statVal(statsArr, ['key passes']),
    tackles: statVal(statsArr, ['tackles']),
    duelsWon: statVal(statsArr, ['duels won']),
    saves: statVal(statsArr, ['saves']),
    yellowCards: statVal(statsArr, ['yellow cards']),
    redCards: statVal(statsArr, ['red cards']),
    rawJson: row,
  };
}

/** AF GET /fixtures/players response[] → 扁平球员行 */
export function mapAfFixturePlayersResponse(
  response: unknown[],
  homeTeamAfId: number | null,
  awayTeamAfId: number | null,
): AfFixturePlayerStatRow[] {
  const out: AfFixturePlayerStatRow[] = [];
  for (const block of response) {
    const b = asRecord(block);
    if (!b) continue;
    const team = asRecord(b.team);
    const tid = num(team?.id);
    let side: 'home' | 'away' | null = null;
    if (tid != null && homeTeamAfId != null && tid === homeTeamAfId) side = 'home';
    else if (tid != null && awayTeamAfId != null && tid === awayTeamAfId) side = 'away';
    else if (out.length === 0 && response.length >= 1) side = 'home';
    else if (response.length === 2) side = 'away';
    if (!side) continue;
    const players = Array.isArray(b.players) ? b.players : [];
    for (const p of players) {
      const mapped = mapOnePlayer(p, side);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}
