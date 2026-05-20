import { asRecord } from './af-fixture-match-fields.util';

export type StandingsRowMapped = {
  leagueRank: number | null;
  points: number | null;
};

export type TeamStatsMapped = {
  recentForm: string | null;
  goalsForAvg: number | null;
  goalsAgainstAvg: number | null;
  attackRating: number | null;
  defenseRating: number | null;
};

export type PlayerStatsMapped = {
  formScore: number | null;
  last5Goals: number | null;
  last5Assists: number | null;
  avgMinutes: number | null;
};

export const ODDS_DISCLAIMER =
  '赔率数据仅为技术快照与模型输入参考，不构成投注建议。展示须符合当地法规与产品资质。';

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** 从 AF standings response[0].league.standings 二维表找 teamId 行 */
export function mapStandingsRow(
  standingsResponse: unknown[],
  apiTeamId: number,
): StandingsRowMapped {
  for (const groupWrap of standingsResponse) {
    const gRec = asRecord(groupWrap);
    const league = asRecord(gRec?.league);
    const standings = league?.standings;
    if (!Array.isArray(standings)) continue;
    for (const tier of standings) {
      if (!Array.isArray(tier)) continue;
      for (let i = 0; i < tier.length; i++) {
        const row = asRecord(tier[i]);
        const team = asRecord(row?.team);
        const tid = num(team?.id);
        if (tid === apiTeamId) {
          return {
            leagueRank: num(row?.rank) ?? i + 1,
            points: num(row?.points),
          };
        }
      }
    }
  }
  return { leagueRank: null, points: null };
}

/** AF /teams/statistics 单项 → 快照字段 */
export function mapTeamStatistics(statistics: Record<string, unknown> | null): TeamStatsMapped {
  if (!statistics) {
    return {
      recentForm: null,
      goalsForAvg: null,
      goalsAgainstAvg: null,
      attackRating: null,
      defenseRating: null,
    };
  }
  const form =
    typeof statistics.form === 'string' && statistics.form.trim() ?
      statistics.form.trim().slice(0, 32)
    : null;
  const fixtures = asRecord(statistics.fixtures);
  const goals = asRecord(statistics.goals);
  const playedNode = asRecord(fixtures?.played);
  const gfNode = asRecord(goals?.for);
  const gaNode = asRecord(goals?.against);
  const gfTotalNode = asRecord(gfNode?.total);
  const gaTotalNode = asRecord(gaNode?.total);
  const played = num(playedNode?.total) ?? num(fixtures?.played) ?? 0;
  const gfTotal = num(gfTotalNode?.total) ?? num(gfNode?.total) ?? null;
  const gaTotal = num(gaTotalNode?.total) ?? num(gaNode?.total) ?? null;
  const gfAvg = played > 0 && gfTotal != null ? gfTotal / played : null;
  const gaAvg = played > 0 && gaTotal != null ? gaTotal / played : null;
  const attackRating =
    gfAvg != null ? clamp(Math.round(40 + gfAvg * 18), 25, 95) : null;
  const defenseRating =
    gaAvg != null ? clamp(Math.round(95 - gaAvg * 18), 25, 95) : null;
  return {
    recentForm: form,
    goalsForAvg: gfAvg,
    goalsAgainstAvg: gaAvg,
    attackRating,
    defenseRating,
  };
}

/** 伤停列表 → 0–10 影响指数 */
export function computeInjuryImpact(injuries: unknown[]): number {
  let score = 0;
  for (const row of injuries) {
    const r = asRecord(row);
    const player = asRecord(r?.player);
    const team = asRecord(r?.team);
    if (!player && !team) continue;
    const reason = String(r?.type ?? r?.reason ?? '').toLowerCase();
    if (reason.includes('missing') || reason.includes('out')) score += 1.2;
    else if (reason.includes('question') || reason.includes('doubt')) score += 0.6;
    else score += 0.4;
  }
  return clamp(Math.round(score * 10) / 10, 0, 10);
}

/** 近 7 天比赛密度 → 0–5 疲劳 */
export function computeFatigueIndex(recentFixtures: unknown[], now = new Date()): number {
  const cutoff = now.getTime() - 7 * 86_400_000;
  let count = 0;
  for (const fx of recentFixtures) {
    const rec = asRecord(fx);
    const fixture = asRecord(rec?.fixture);
    const dateStr = fixture?.date;
    if (typeof dateStr !== 'string') continue;
    const t = new Date(dateStr).getTime();
    if (Number.isFinite(t) && t >= cutoff && t <= now.getTime()) count += 1;
  }
  return clamp(Math.round((count / 3) * 10) / 10, 0, 5);
}

/** AF /players 分页单项 */
export function mapPlayerSeasonStats(playerRow: unknown): PlayerStatsMapped {
  const root = asRecord(playerRow);
  const statsArr = Array.isArray(root?.statistics) ? root.statistics : [];
  const stat0 = asRecord(statsArr[0]);
  const games = asRecord(stat0?.games);
  const goals = asRecord(stat0?.goals);
  const minutes = num(games?.minutes);
  const appearances = num(games?.appearences) ?? num(games?.appearances) ?? 0;
  const g = num(goals?.total) ?? 0;
  const a = num(goals?.assists) ?? 0;
  const avgMin = appearances > 0 && minutes != null ? minutes / appearances : null;
  const formScore = clamp(Math.round(45 + g * 4 + a * 2 + (avgMin ?? 0) / 15), 35, 92);
  return {
    formScore,
    last5Goals: g > 0 ? Math.min(5, g) : null,
    last5Assists: a > 0 ? Math.min(5, a) : null,
    avgMinutes: avgMin,
  };
}

/** 精简 odds response → marketsJson */
export function shrinkOddsMarkets(raw: Record<string, unknown>): Record<string, unknown> {
  const resp = Array.isArray(raw.response) ? raw.response : [];
  const out: Record<string, unknown>[] = [];
  for (const row of resp.slice(0, 8)) {
    const r = asRecord(row);
    const fixture = asRecord(r?.fixture);
    const bookmakers = Array.isArray(r?.bookmakers) ? r.bookmakers : [];
    const books: Record<string, unknown>[] = [];
    for (const bm of bookmakers.slice(0, 5)) {
      const b = asRecord(bm);
      const markets: Record<string, unknown>[] = [];
      for (const m of (Array.isArray(b?.bets) ? b.bets : []).slice(0, 12)) {
        const bet = asRecord(m);
        if (!bet) continue;
        markets.push({
          id: bet.id,
          name: bet.name,
          values: Array.isArray(bet.values) ?
            bet.values.slice(0, 20).map((v) => {
              const vr = asRecord(v);
              return { value: vr?.value, odd: vr?.odd };
            })
          : [],
        });
      }
      if (!b) continue;
      books.push({
        id: b.id,
        name: b.name,
        markets,
      });
    }
    out.push({
      fixtureId: fixture?.id,
      bookmakers: books,
    });
  }
  return { snapshots: out, capturedFrom: 'API_FOOTBALL' };
}

/** 从 shrink 后 markets 提取 1X2 隐含概率摘要（intel teaser） */
export function extractOdds1x2Teaser(marketsJson: unknown): {
  marketName: string | null;
  home: number | null;
  draw: number | null;
  away: number | null;
} | null {
  const root = asRecord(marketsJson);
  const snaps = Array.isArray(root?.snapshots) ? root.snapshots : [];
  const first = asRecord(snaps[0]);
  const books = Array.isArray(first?.bookmakers) ? first.bookmakers : [];
  const bm0 = asRecord(books[0]);
  const markets = Array.isArray(bm0?.markets) ? bm0.markets : [];
  for (const m of markets) {
    const mr = asRecord(m);
    const name = String(mr?.name ?? '').toLowerCase();
    if (!name.includes('match winner') && name !== '1x2' && !name.includes('winner')) continue;
    const vals = Array.isArray(mr?.values) ? mr.values : [];
    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const v of vals) {
      const vr = asRecord(v);
      const label = String(vr?.value ?? '').toLowerCase();
      const odd = num(vr?.odd);
      if (odd == null || odd <= 1) continue;
      const imp = 1 / odd;
      if (label === 'home') home = imp;
      else if (label === 'draw') draw = imp;
      else if (label === 'away') away = imp;
    }
    if (home != null || draw != null || away != null) {
      const sum = (home ?? 0) + (draw ?? 0) + (away ?? 0) || 1;
      const marketName = typeof mr?.name === 'string' ? mr.name : null;
      return {
        marketName,
        home: home != null ? Math.round((home / sum) * 1000) / 10 : null,
        draw: draw != null ? Math.round((draw / sum) * 1000) / 10 : null,
        away: away != null ? Math.round((away / sum) * 1000) / 10 : null,
      };
    }
  }
  return null;
}

/** 从 shrink 后 markets 提取 1X2 十进制赔率 */
export function extractOdds1x2Decimals(marketsJson: unknown): {
  home: number | null;
  draw: number | null;
  away: number | null;
} | null {
  const root = asRecord(marketsJson);
  const snaps = Array.isArray(root?.snapshots) ? root.snapshots : [];
  const first = asRecord(snaps[0]);
  const books = Array.isArray(first?.bookmakers) ? first.bookmakers : [];
  const bm0 = asRecord(books[0]);
  const markets = Array.isArray(bm0?.markets) ? bm0.markets : [];
  for (const m of markets) {
    const mr = asRecord(m);
    const name = String(mr?.name ?? '').toLowerCase();
    if (!name.includes('match winner') && name !== '1x2' && !name.includes('winner')) continue;
    const vals = Array.isArray(mr?.values) ? mr.values : [];
    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const v of vals) {
      const vr = asRecord(v);
      const label = String(vr?.value ?? '').toLowerCase();
      const odd = num(vr?.odd);
      if (odd == null || odd <= 1) continue;
      if (label === 'home') home = odd;
      else if (label === 'draw') draw = odd;
      else if (label === 'away') away = odd;
    }
    if (home != null || draw != null || away != null) {
      return { home, draw, away };
    }
  }
  return null;
}

function findMarketOdds(
  marketsJson: unknown,
  nameHints: string[],
): { label: string; odd: number }[] {
  const root = asRecord(marketsJson);
  const snaps = Array.isArray(root?.snapshots) ? root.snapshots : [];
  const first = asRecord(snaps[0]);
  const books = Array.isArray(first?.bookmakers) ? first.bookmakers : [];
  for (const bm of books) {
    const b = asRecord(bm);
    const markets = Array.isArray(b?.markets) ? b.markets : [];
    for (const m of markets) {
      const mr = asRecord(m);
      const name = String(mr?.name ?? '').toLowerCase();
      if (!nameHints.some((h) => name.includes(h))) continue;
      const vals = Array.isArray(mr?.values) ? mr.values : [];
      const out: { label: string; odd: number }[] = [];
      for (const v of vals) {
        const vr = asRecord(v);
        const odd = num(vr?.odd);
        if (odd == null || odd <= 1) continue;
        out.push({ label: String(vr?.value ?? ''), odd });
      }
      if (out.length) return out;
    }
  }
  return [];
}

/** 亚洲让球盘十进制赔率（主/客） */
export function extractAsianHandicapDecimals(marketsJson: unknown): {
  line: number | null;
  home: number | null;
  away: number | null;
} | null {
  const vals = findMarketOdds(marketsJson, [
    'asian handicap',
    'handicap',
    'ah',
  ]);
  if (!vals.length) return null;
  let line: number | null = null;
  let home: number | null = null;
  let away: number | null = null;
  for (const v of vals) {
    const label = v.label.toLowerCase();
    const m = label.match(/(-?\d+(?:\.\d+)?)/);
    if (m && line == null) line = Number(m[1]);
    if (label.includes('home') || label.includes('主')) home = v.odd;
    if (label.includes('away') || label.includes('客')) away = v.odd;
  }
  if (vals.length >= 2 && home == null && away == null) {
    home = vals[0]?.odd ?? null;
    away = vals[1]?.odd ?? null;
  }
  if (home == null && away == null) return null;
  return { line, home, away };
}

/** 从 AF lineups 响应提取阵型 */
export function extractFormationFromAfLineups(
  lineupsJson: unknown,
  teamApiId: number,
): string | null {
  const rows = Array.isArray(lineupsJson) ? lineupsJson : [];
  for (const row of rows) {
    const rec = asRecord(row);
    const team = asRecord(rec?.team);
    if (Number(team?.id) !== teamApiId) continue;
    const formation = rec?.formation;
    if (typeof formation === 'string' && formation.trim()) return formation.trim();
  }
  return null;
}

/** 尝试匹配球员任意进球赔率 */
export function findPlayerAnytimeGoalOdd(
  marketsJson: unknown,
  playerName: string,
): number | null {
  const needle = playerName.trim().toLowerCase();
  if (!needle) return null;
  const vals = findMarketOdds(marketsJson, [
    'anytime goal',
    'goal scorer',
    'player to score',
    'first goal',
  ]);
  for (const v of vals) {
    if (v.label.toLowerCase().includes(needle)) return v.odd;
  }
  return null;
}
