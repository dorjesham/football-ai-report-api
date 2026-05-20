import type { MatchIntelRow } from '../../matches/match-intel.mapper';
import type { MatchIntelPredictionPreview } from '../../matches/match-intel.types';
import type {
  ActivityHeatmapRow,
  MomentumSegment,
  SectionAvailability,
  TacticalComparisonRow,
} from '../match-detail-pre-unlocked.types';

function ratingTag(score: number, kind: 'attack' | 'defense'): string {
  if (kind === 'attack') {
    if (score >= 70) return '进攻压制';
    if (score >= 55) return '稳定输出';
    return '进攻效率一般';
  }
  if (score >= 70) return '防守稳固';
  if (score >= 55) return '结构紧凑';
  return '防守承压';
}

export function buildTacticalComparisonSection(match: MatchIntelRow): {
  rows: TacticalComparisonRow[];
  availability: SectionAvailability;
  dataQuality: string;
} {
  const homeSnap = match.teamSnapshots.find((s) => s.isHome);
  const awaySnap = match.teamSnapshots.find((s) => !s.isHome);
  const ha = homeSnap?.attackRating ?? 50;
  const hd = homeSnap?.defenseRating ?? 50;
  const aa = awaySnap?.attackRating ?? 50;
  const ad = awaySnap?.defenseRating ?? 50;

  const rows: TacticalComparisonRow[] = [
    {
      dimension: '进攻组织',
      homeScore: ha,
      awayScore: aa,
      homeTag: ratingTag(ha, 'attack'),
      awayTag: ratingTag(aa, 'attack'),
    },
    {
      dimension: '防守稳固',
      homeScore: hd,
      awayScore: ad,
      homeTag: ratingTag(hd, 'defense'),
      awayTag: ratingTag(ad, 'defense'),
    },
    {
      dimension: '定位球威胁',
      homeScore: Math.round((ha + hd) / 2),
      awayScore: Math.round((aa + ad) / 2),
      homeTag: '定位球',
      awayTag: '定位球',
    },
    {
      dimension: '边路进攻',
      homeScore: ha,
      awayScore: aa + 5,
      homeTag: ratingTag(ha, 'attack'),
      awayTag: ratingTag(aa, 'attack'),
    },
    {
      dimension: '中场控制',
      homeScore: Math.min(95, ha + 8),
      awayScore: aa,
      homeTag: ratingTag(ha + 8, 'attack'),
      awayTag: ratingTag(aa, 'attack'),
    },
  ];

  return {
    rows,
    availability: homeSnap ? 'present' : 'partial',
    dataQuality: 'MODEL_ESTIMATED',
  };
}

export function buildMomentumSection(
  preview: MatchIntelPredictionPreview | null,
): {
  segments: MomentumSegment[];
  availability: SectionAvailability;
  dataQuality: string;
} {
  const homeBias = (preview?.homeWinProbability ?? 50) / 100;
  const tempo = (preview?.tempoIndex ?? 60) / 100;
  const segments: MomentumSegment[] = [
    { fromMinute: 0, toMinute: 15, home: 0.7 * tempo, away: 0.4 },
    { fromMinute: 15, toMinute: 30, home: 0.75 * tempo, away: 0.45 },
    { fromMinute: 30, toMinute: 45, home: 0.85 * homeBias, away: 0.5 },
    { fromMinute: 45, toMinute: 60, home: 0.55, away: 0.65 * (1 - homeBias + 0.3) },
    { fromMinute: 60, toMinute: 75, home: 0.5, away: 0.75 },
    { fromMinute: 75, toMinute: 90, home: 0.7 * homeBias, away: 0.55 },
  ].map((s) => ({
    ...s,
    home: Math.round(s.home * 100),
    away: Math.round(s.away * 100),
  }));

  return {
    segments,
    availability: preview ? 'present' : 'partial',
    dataQuality: 'MODEL_ESTIMATED',
  };
}

export function buildActivityHeatmapSection(match: MatchIntelRow): {
  rows: ActivityHeatmapRow[];
  availability: SectionAvailability;
  dataQuality: string;
} {
  const homeSnap = match.teamSnapshots.find((s) => s.isHome);
  const awaySnap = match.teamSnapshots.find((s) => !s.isHome);
  const ha = homeSnap?.attackRating ?? 50;
  const aa = awaySnap?.attackRating ?? 50;
  const hd = homeSnap?.defenseRating ?? 50;
  const ad = awaySnap?.defenseRating ?? 50;

  const rows: ActivityHeatmapRow[] = [
    { label: '左路进攻', homePct: ha + 10, awayPct: aa },
    { label: '中路进攻', homePct: ha + 5, awayPct: aa - 5 },
    { label: '右路进攻', homePct: ha, awayPct: aa + 5 },
    { label: '左路防守', homePct: 100 - ad, awayPct: 100 - hd },
    { label: '中路防守', homePct: hd, awayPct: ad },
    { label: '右路防守', homePct: hd - 5, awayPct: ad + 5 },
  ].map((r) => ({
    label: r.label,
    homePct: Math.min(95, Math.max(25, r.homePct)),
    awayPct: Math.min(95, Math.max(25, r.awayPct)),
  }));

  return { rows, availability: 'present', dataQuality: 'MODEL_ESTIMATED' };
}
