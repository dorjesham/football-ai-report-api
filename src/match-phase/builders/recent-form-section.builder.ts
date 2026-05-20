import { parsePreMatchUiFacts } from '../../api-football/af-recent-fixtures.mapper';
import type { MatchIntelRow } from '../../matches/match-intel.mapper';
import type {
  RecentFormSection,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';

export function buildRecentFormSection(
  match: MatchIntelRow,
  supplementaryFacts: unknown,
): { section: RecentFormSection; availability: SectionAvailability } {
  const uiFacts = parsePreMatchUiFacts(supplementaryFacts);
  const homeSnap = match.teamSnapshots.find((s) => s.isHome);
  const awaySnap = match.teamSnapshots.find((s) => !s.isHome);

  const homeMatches = uiFacts?.recentForm?.home?.matches ?? [];
  const awayMatches = uiFacts?.recentForm?.away?.matches ?? [];

  const section: RecentFormSection = {
    home: {
      form: homeSnap?.recentForm ?? uiFacts?.recentForm?.home?.form ?? null,
      matches: homeMatches,
    },
    away: {
      form: awaySnap?.recentForm ?? uiFacts?.recentForm?.away?.form ?? null,
      matches: awayMatches,
    },
  };

  let availability: SectionAvailability = 'missing';
  if (homeMatches.length >= 3 && awayMatches.length >= 3) availability = 'present';
  else if (homeMatches.length > 0 || awayMatches.length > 0 || section.home.form) {
    availability = 'partial';
  }

  return { section, availability };
}
