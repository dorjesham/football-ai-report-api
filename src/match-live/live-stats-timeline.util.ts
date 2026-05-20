import { keyMetricsFromAfTeamStats } from './live-key-metrics.util';

export const LIVE_STATS_TIMELINE_SCHEMA = 'live-stats-timeline-v1' as const;

export type LiveStatsTimelinePoint = {
  at: string;
  elapsed: number | null;
  home: Record<string, number | null>;
  away: Record<string, number | null>;
};

export type LiveStatsTimelineStorage = {
  schema: typeof LIVE_STATS_TIMELINE_SCHEMA;
  points: LiveStatsTimelinePoint[];
};

const MAX_POINTS = 120;

function sideMetrics(
  km: NonNullable<ReturnType<typeof keyMetricsFromAfTeamStats>>,
  side: 'home' | 'away',
): Record<string, number | null> {
  const s = side === 'home' ? km.home : km.away;
  return {
    possession: s.possession ?? null,
    shotsTotal: s.shotsTotal ?? null,
    shotsOnTarget: s.shotsOnTarget ?? null,
    corners: s.corners ?? null,
    fouls: s.fouls ?? null,
    yellowCards: s.yellowCards ?? null,
    redCards: s.redCards ?? null,
  };
}

export function parseLiveStatsTimeline(raw: unknown): LiveStatsTimelineStorage {
  if (!raw || typeof raw !== 'object') {
    return { schema: LIVE_STATS_TIMELINE_SCHEMA, points: [] };
  }
  const o = raw as Record<string, unknown>;
  if (o.schema === LIVE_STATS_TIMELINE_SCHEMA && Array.isArray(o.points)) {
    return { schema: LIVE_STATS_TIMELINE_SCHEMA, points: o.points as LiveStatsTimelinePoint[] };
  }
  return { schema: LIVE_STATS_TIMELINE_SCHEMA, points: [] };
}

/** 每次 AF statistics 同步后追加一点；同 elapsed 覆盖 */
export function appendLiveStatsTimelinePoint(
  existing: unknown,
  elapsed: number | null,
  teamStatsPayload: { apiFootball?: { response?: unknown } },
): LiveStatsTimelineStorage {
  const prev = parseLiveStatsTimeline(existing);
  const afRaw = teamStatsPayload.apiFootball?.response;
  const km =
    afRaw ?
      keyMetricsFromAfTeamStats({ response: afRaw })
    : null;
  const point: LiveStatsTimelinePoint = {
    at: new Date().toISOString(),
    elapsed,
    home: km ? sideMetrics(km, 'home') : {},
    away: km ? sideMetrics(km, 'away') : {},
  };

  let points = [...prev.points];
  if (elapsed != null) {
    points = points.filter((p) => p.elapsed !== elapsed);
  }
  points.push(point);
  if (points.length > MAX_POINTS) {
    points = points.slice(-MAX_POINTS);
  }
  return { schema: LIVE_STATS_TIMELINE_SCHEMA, points };
}

export function possessionTimelineForBff(
  storage: LiveStatsTimelineStorage,
): Array<{
  elapsed: number | null;
  homePossession: number | null;
  awayPossession: number | null;
}> {
  return storage.points.map((p) => ({
    elapsed: p.elapsed,
    homePossession: p.home.possession ?? null,
    awayPossession: p.away.possession ?? null,
  }));
}
