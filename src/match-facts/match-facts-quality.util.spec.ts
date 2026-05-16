import { MatchStatus } from '@prisma/client';
import { assessMatchFactsQuality } from './match-facts-quality.util';

describe('assessMatchFactsQuality', () => {
  it('flags FINISHED without facts', () => {
    const issues = assessMatchFactsQuality({
      matchId: 'm1',
      status: MatchStatus.FINISHED,
      kickoffTime: new Date(),
      homeScore: 1,
      awayScore: 0,
      facts: null,
    });
    expect(issues.some((i) => i.code === 'MISSING_FACTS_ROW')).toBe(true);
  });

  it('flags score mismatch', () => {
    const issues = assessMatchFactsQuality({
      matchId: 'm1',
      status: MatchStatus.FINISHED,
      kickoffTime: new Date(),
      homeScore: 2,
      awayScore: 1,
      facts: {
        ftHome: 1,
        ftAway: 1,
        validatedAt: new Date(),
        events: { schema: 'match-events-v1', items: [{ id: '1' }] },
        teamStats: {},
        lineups: {},
      },
    });
    expect(issues.some((i) => i.code === 'SCORE_MISMATCH')).toBe(true);
  });
});
