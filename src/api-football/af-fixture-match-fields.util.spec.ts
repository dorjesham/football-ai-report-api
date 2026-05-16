import { extractAfScoreExtended } from './af-fixture-match-fields.util';

describe('extractAfScoreExtended', () => {
  it('parses halftime and fulltime from AF score block', () => {
    const raw = {
      score: {
        halftime: { home: 1, away: 0 },
        fulltime: { home: 2, away: 1 },
        extratime: { home: null, away: null },
        penalty: { home: null, away: null },
      },
    };
    const s = extractAfScoreExtended(raw);
    expect(s.htHome).toBe(1);
    expect(s.htAway).toBe(0);
    expect(s.ftHome).toBe(2);
    expect(s.ftAway).toBe(1);
  });
});
