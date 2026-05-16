import { MatchStatus } from '@prisma/client';
import {
  isMatchInLiveFactsWindow,
  needsAfLiveFactsSync,
  needsAfFactsSync,
} from './match-af-facts-sync.util';

describe('needsAfFactsSync', () => {
  it('skips non-FINISHED', () => {
    expect(
      needsAfFactsSync({ status: MatchStatus.LIVE }, null).needed,
    ).toBe(false);
  });
});

describe('needsAfLiveFactsSync', () => {
  it('needs sync when LIVE and never synced', () => {
    expect(
      needsAfLiveFactsSync(
        { status: MatchStatus.LIVE, kickoffTime: new Date(Date.now() - 3600_000) },
        null,
      ).needed,
    ).toBe(true);
  });

  it('skips within interval', () => {
    expect(
      needsAfLiveFactsSync(
        { status: MatchStatus.LIVE },
        {
          lineups: null,
          events: null,
          teamStats: null,
          afLastSyncedAt: null,
          afLiveLastSyncedAt: new Date(),
        },
        { minIntervalSec: 60 },
      ).needed,
    ).toBe(false);
  });
});

describe('isMatchInLiveFactsWindow', () => {
  it('true for LIVE', () => {
    expect(isMatchInLiveFactsWindow({ status: MatchStatus.LIVE })).toBe(true);
  });
});
