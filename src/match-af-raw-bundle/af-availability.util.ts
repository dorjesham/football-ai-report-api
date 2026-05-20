export type AfAvailabilityStatus =
  | 'present'
  | 'empty'
  | 'missing'
  | 'stale'
  | 'error';

export function availabilityFromValue(
  value: unknown,
  lastError?: string | null,
): AfAvailabilityStatus {
  if (lastError) return 'error';
  if (value == null) return 'missing';
  if (Array.isArray(value)) return value.length > 0 ? 'present' : 'empty';
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return keys.length > 0 ? 'present' : 'empty';
  }
  return 'present';
}

export type BundleJsonField =
  | 'fixtureJson'
  | 'lineupsJson'
  | 'eventsJson'
  | 'statisticsJson'
  | 'playersJson'
  | 'injuriesJson'
  | 'predictionsJson'
  | 'oddsLatestJson'
  | 'h2hJson'
  | 'homeCoachJson'
  | 'awayCoachJson'
  | 'homeTeamStatsJson'
  | 'awayTeamStatsJson'
  | 'homeSquadJson'
  | 'awaySquadJson';

export const BUNDLE_TRACKED_FIELDS: BundleJsonField[] = [
  'fixtureJson',
  'lineupsJson',
  'eventsJson',
  'statisticsJson',
  'playersJson',
  'injuriesJson',
  'predictionsJson',
  'oddsLatestJson',
  'h2hJson',
  'homeCoachJson',
  'awayCoachJson',
  'homeTeamStatsJson',
  'awayTeamStatsJson',
  'homeSquadJson',
  'awaySquadJson',
];
