import {
  extractAfLeagueRoundFields,
  extractAfLiveClock,
} from './af-fixture-match-fields.util';

describe('extractAfLeagueRoundFields', () => {
  it('parses regular season round', () => {
    const out = extractAfLeagueRoundFields({
      league: { round: 'Regular Season - 12' },
    });
    expect(out.round).toBe('Regular Season - 12');
    expect(out.matchday).toBe(12);
  });
});

describe('extractAfLiveClock', () => {
  it('reads elapsed from fixture status', () => {
    const out = extractAfLiveClock({
      fixture: { status: { short: '2H', elapsed: 67, extra: 2 } },
    });
    expect(out.elapsed).toBe(67);
    expect(out.extra).toBe(2);
    expect(out.periodShort).toBe('2H');
  });
});
