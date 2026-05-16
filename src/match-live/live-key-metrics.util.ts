import { asRecord } from '../api-football/af-fixture-match-fields.util';

export type LiveKeyMetricsSide = Record<string, number | null>;

export type LiveKeyMetrics = {
  home: LiveKeyMetricsSide;
  away: LiveKeyMetricsSide;
};

export type MetricAvailability = 'present' | 'unavailable';

export type LiveKeyMetricsWithAvailability = {
  home: Record<string, { value: number | null; availability: MetricAvailability }>;
  away: Record<string, { value: number | null; availability: MetricAvailability }>;
};

const METRIC_LABELS_ZH: Record<string, string> = {
  possession: '控球率',
  shotsTotal: '射门',
  shotsOnTarget: '射正',
  corners: '角球',
  fouls: '犯规',
  yellowCards: '黄牌',
  redCards: '红牌',
  offsides: '越位',
};

/** C 端显式「无数据」：null 标为 unavailable */
export function enrichKeyMetricsAvailability(
  km: LiveKeyMetrics | null,
): LiveKeyMetricsWithAvailability | null {
  if (!km) return null;
  const enrichSide = (side: LiveKeyMetricsSide) => {
    const out: LiveKeyMetricsWithAvailability['home'] = {};
    for (const key of Object.keys(AF_STAT_ALIASES)) {
      const v = side[key] ?? null;
      out[key] = {
        value: v,
        availability: v != null ? 'present' : 'unavailable',
      };
    }
    return out;
  };
  return {
    home: enrichSide(km.home),
    away: enrichSide(km.away),
  };
}

export function metricLabelsZh(): Record<string, string> {
  return { ...METRIC_LABELS_ZH };
}

const AF_STAT_ALIASES: Record<string, string[]> = {
  possession: ['Ball Possession', 'Possession'],
  shotsTotal: ['Total Shots', 'Shots Total'],
  shotsOnTarget: ['Shots on Goal', 'Shots on Target'],
  corners: ['Corner Kicks', 'Corners'],
  fouls: ['Fouls'],
  yellowCards: ['Yellow Cards'],
  redCards: ['Red Cards'],
  offsides: ['Offsides'],
};

function parsePercent(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%?/);
  return m ? Number(m[1]) : null;
}

function parseIntStat(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function readAfSideMetrics(teamBlock: Record<string, unknown>): LiveKeyMetricsSide {
  const out: LiveKeyMetricsSide = {};
  const stats = Array.isArray(teamBlock.statistics) ? teamBlock.statistics : [];
  const map = new Map<string, string>();
  for (const s of stats) {
    const sr = asRecord(s);
    if (!sr) continue;
    const type = String(sr.type ?? '');
    const val = sr.value != null ? String(sr.value) : '';
    map.set(type, val);
  }
  for (const [key, aliases] of Object.entries(AF_STAT_ALIASES)) {
    let found: number | null = null;
    for (const alias of aliases) {
      const raw = map.get(alias);
      if (raw == null) continue;
      found =
        key === 'possession' ? parsePercent(raw)
        : parseIntStat(raw);
      if (found != null) break;
    }
    out[key] = found;
  }
  return out;
}

/** AF teamStats.response 两项 */
export function keyMetricsFromAfTeamStats(teamStatsJson: unknown): LiveKeyMetrics | null {
  const root = teamStatsJson as { response?: unknown[] } | null;
  const resp = Array.isArray(root?.response) ? root.response : null;
  if (!resp || resp.length < 2) return null;
  const homeBlock = asRecord(resp[0]);
  const awayBlock = asRecord(resp[1]);
  if (!homeBlock || !awayBlock) return null;
  return {
    home: readAfSideMetrics(homeBlock),
    away: readAfSideMetrics(awayBlock),
  };
}

/** FD 单场 statistics 摘要 */
export function keyMetricsFromFdTotals(args: {
  homeYellow: number;
  homeRed: number;
  homeFouls: number;
  awayYellow: number;
  awayRed: number;
  awayFouls: number;
}): LiveKeyMetrics {
  return {
    home: {
      yellowCards: args.homeYellow,
      redCards: args.homeRed,
      fouls: args.homeFouls,
      possession: null,
      shotsTotal: null,
      shotsOnTarget: null,
      corners: null,
      offsides: null,
    },
    away: {
      yellowCards: args.awayYellow,
      redCards: args.awayRed,
      fouls: args.awayFouls,
      possession: null,
      shotsTotal: null,
      shotsOnTarget: null,
      corners: null,
      offsides: null,
    },
  };
}
