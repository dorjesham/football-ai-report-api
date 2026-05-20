import type { MatchIntelRow } from '../../matches/match-intel.mapper';
import type { MatchPhaseInjuryItem } from '../match-phase.types';
import type { PlayerSeasonMetricRow } from './extended-markets.builder';
import type {
  InjuriesSection,
  InjuryUiItem,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';

const CORE_PI_THRESHOLD = 80;

function enrichInjury(
  item: MatchPhaseInjuryItem,
  match: MatchIntelRow,
  seasonByName: Map<string, PlayerSeasonMetricRow>,
): InjuryUiItem {
  const pi = match.playerIntelligence.find(
    (p) =>
      p.player.nameCn === item.playerName ||
      p.player.nameEn === item.playerName,
  );
  const season =
    pi ? seasonByName.get(pi.playerId) : undefined;
  const isCore =
    (pi?.startProbability ?? 0) >= 75 ||
    (season?.goals ?? 0) >= 5 ||
    (pi?.player && 'powerRating' in pi.player ?
      Number((pi.player as { powerRating?: number }).powerRating) >= CORE_PI_THRESHOLD
    : false);

  const reason = item.reason ?? item.type ?? '';
  const lower = reason.toLowerCase();
  let severity: InjuryUiItem['severity'] = 'medium';
  if (
    lower.includes('out') ||
    lower.includes('missing') ||
    lower.includes('tear') ||
    lower.includes('acl')
  ) {
    severity = 'high';
  } else if (lower.includes('doubt') || lower.includes('question')) {
    severity = 'medium';
  } else if (!reason) {
    severity = 'low';
  }

  let statusText = reason || '伤停情况待确认';
  if (lower.includes('doubt') || lower.includes('question')) {
    statusText = `${reason || '出战成疑'} · 预计本场可能出战`;
  } else if (severity === 'high') {
    statusText = `${reason || '伤病'} · 预计缺阵`;
  } else if (isCore) {
    statusText = `${reason || '轻微不适'} · 预计本场可出战`;
  }

  return {
    playerName: item.playerName,
    isCore,
    severity,
    statusText,
    type: item.type,
    reason: item.reason,
    teamSide: item.teamSide,
  };
}

export function buildInjuriesSection(
  match: MatchIntelRow,
  homeInjuries: MatchPhaseInjuryItem[],
  awayInjuries: MatchPhaseInjuryItem[],
  playerSeasonMetrics: PlayerSeasonMetricRow[] = [],
): { section: InjuriesSection; availability: SectionAvailability } {
  const seasonByName = new Map(
    playerSeasonMetrics.map((m) => [m.playerId, m]),
  );
  const section: InjuriesSection = {
    home: homeInjuries.map((i) => enrichInjury(i, match, seasonByName)),
    away: awayInjuries.map((i) => enrichInjury(i, match, seasonByName)),
  };

  const total = section.home.length + section.away.length;
  const hasDetail = [...section.home, ...section.away].some((i) => i.reason || i.type);
  const availability: SectionAvailability =
    total >= 4 && hasDetail ? 'present'
    : total > 0 ? 'partial'
    : 'missing';

  return { section, availability };
}
