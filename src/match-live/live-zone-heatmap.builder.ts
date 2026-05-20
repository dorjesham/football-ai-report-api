import type { LiveEventV1 } from './live-event.types';

export type ActivityHeatmapLiveRow = {
  label: string;
  homePct: number;
  awayPct: number;
};

export type ActivityHeatmapLiveSection = {
  rows: ActivityHeatmapLiveRow[];
  dataQuality: 'AGGREGATED_FROM_EVENTS' | 'MISSING';
  availability: 'present' | 'missing';
};

type PlayerStatRow = {
  teamSide: string;
  shots: number | null;
  shotsOn: number | null;
  goals: number | null;
};

/** 由事件 + 球员射门统计聚合三区活跃度（非坐标） */
export function buildLiveZoneHeatmap(args: {
  events: LiveEventV1[];
  playerStats: PlayerStatRow[];
}): ActivityHeatmapLiveSection {
  let homeGoals = 0;
  let awayGoals = 0;
  let homeShots = 0;
  let awayShots = 0;
  let homeCards = 0;
  let awayCards = 0;

  for (const e of args.events) {
    const t = `${e.type} ${e.detail ?? ''}`.toLowerCase();
    if (t.includes('goal')) {
      if (e.teamSide === 'home') homeGoals += 1;
      else if (e.teamSide === 'away') awayGoals += 1;
    }
    if (t.includes('card')) {
      if (e.teamSide === 'home') homeCards += 1;
      else if (e.teamSide === 'away') awayCards += 1;
    }
  }

  for (const p of args.playerStats) {
    const sh = (p.shots ?? 0) + (p.shotsOn ?? 0) + (p.goals ?? 0) * 2;
    if (p.teamSide === 'home') homeShots += sh;
    else if (p.teamSide === 'away') awayShots += sh;
  }

  const homeAttack = homeGoals * 15 + homeShots * 3 + 20;
  const awayAttack = awayGoals * 15 + awayShots * 3 + 20;
  const homeMid = homeShots * 2 + homeGoals * 5 + 25;
  const awayMid = awayShots * 2 + awayGoals * 5 + 25;
  const homeDef = 30 + homeCards * 5;
  const awayDef = 30 + awayCards * 5;

  const norm = (h: number, a: number) => {
    const sum = h + a || 1;
    return {
      homePct: Math.min(95, Math.max(15, Math.round((h / sum) * 100))),
      awayPct: Math.min(95, Math.max(15, Math.round((a / sum) * 100))),
    };
  };

  const hasData =
    args.events.length > 0 ||
    args.playerStats.some((p) => (p.shots ?? 0) + (p.shotsOn ?? 0) > 0);

  if (!hasData) {
    return {
      rows: [],
      dataQuality: 'MISSING',
      availability: 'missing',
    };
  }

  return {
    rows: [
      { label: '进攻三区', ...norm(homeAttack, awayAttack) },
      { label: '中场控制', ...norm(homeMid, awayMid) },
      { label: '防守压力', ...norm(homeDef, awayDef) },
    ],
    dataQuality: 'AGGREGATED_FROM_EVENTS',
    availability: 'present',
  };
}
