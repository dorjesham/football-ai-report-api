import { asRecord } from '../api-football/af-fixture-match-fields.util';

export type NormalizedTopscorerRow = {
  rank: number;
  playerId: string | null;
  apiPlayerId: number | null;
  apiTeamId: number | null;
  nameCn: string;
  nameEn: string;
  avatarUrl: string | null;
  position: string | null;
  teamName: string | null;
  teamLogo: string | null;
  goals: number | null;
  assists: number | null;
  minutes: number | null;
  metricValue: number | null;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 规范化 AF `/players/topscorers` response */
export function normalizeTopscorersResponse(
  response: unknown[],
  metric: 'goals' | 'fantasyPrice' | 'powerRating' | 'fbrefMinutes',
): NormalizedTopscorerRow[] {
  const rows: NormalizedTopscorerRow[] = [];
  for (const wrap of response) {
    const pRec = asRecord(wrap);
    if (!pRec) continue;
    const player = asRecord(pRec.player);
    if (!player) continue;
    const pid = num(player.id);
    const statsArr = Array.isArray(pRec.statistics) ? pRec.statistics : [];
      const st0 = statsArr.length ? asRecord(statsArr[0]) : null;
      const team = asRecord(st0?.team);
      const goalsNode = asRecord(st0?.goals);
      const goals = num(goalsNode?.total);
      const assistsNode = asRecord(st0?.assists);
      const assists = num(assistsNode?.total) ?? num(st0?.assists);
      const games = asRecord(st0?.games);
      const teamIdAf = num(team?.id);
      const name =
        (typeof player.name === 'string' && player.name.trim()) || 'Unknown';
      const photo =
        typeof player.photo === 'string' && player.photo.trim() ?
          player.photo.trim().startsWith('//') ?
            `https:${player.photo.trim()}`
          : player.photo.trim()
        : null;
    rows.push({
      rank: rows.length + 1,
      playerId: pid != null ? `af-p-${pid}` : null,
      apiPlayerId: pid,
      apiTeamId: teamIdAf,
      nameCn: name,
      nameEn: name,
      avatarUrl: photo,
      position:
        typeof games?.position === 'string' ? games.position
        : typeof player.position === 'string' ? player.position
        : null,
      teamName: typeof team?.name === 'string' ? team.name : null,
      teamLogo: typeof team?.logo === 'string' ? team.logo : null,
      goals,
      assists,
      minutes: num(games?.minutes),
      metricValue:
        metric === 'goals' ? goals
        : metric === 'fbrefMinutes' ? num(games?.minutes)
        : goals,
    });
  }
  return rows.sort((a, b) => (b.metricValue ?? 0) - (a.metricValue ?? 0));
}
