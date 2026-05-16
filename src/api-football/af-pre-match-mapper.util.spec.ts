import {
  computeFatigueIndex,
  computeInjuryImpact,
  mapStandingsRow,
  mapTeamStatistics,
  shrinkOddsMarkets,
} from './af-pre-match-mapper.util';

describe('af-pre-match-mapper', () => {
  it('mapStandingsRow finds team rank', () => {
    const resp = [
      {
        league: {
          standings: [
            [
              { rank: 3, points: 45, team: { id: 33 } },
              { rank: 1, points: 60, team: { id: 40 } },
            ],
          ],
        },
      },
    ];
    expect(mapStandingsRow(resp, 33)).toEqual({ leagueRank: 3, points: 45 });
  });

  it('mapTeamStatistics parses form and goals', () => {
    const s = mapTeamStatistics({
      form: 'WWDLW',
      fixtures: { played: { total: 10 } },
      goals: { for: { total: { total: 20 } }, against: { total: { total: 10 } } },
    });
    expect(s.recentForm).toBe('WWDLW');
    expect(s.goalsForAvg).toBe(2);
    expect(s.goalsAgainstAvg).toBe(1);
  });

  it('computeInjuryImpact weights missing players', () => {
    expect(
      computeInjuryImpact([
        { type: 'Missing', player: { id: 1 } },
        { type: 'Questionable', player: { id: 2 } },
      ]),
    ).toBeGreaterThan(0);
  });

  it('computeFatigueIndex counts recent fixtures', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const fixtures = [
      { fixture: { date: '2026-05-14T15:00:00Z' } },
      { fixture: { date: '2026-05-10T15:00:00Z' } },
    ];
    expect(computeFatigueIndex(fixtures, now)).toBeGreaterThan(0);
  });

  it('shrinkOddsMarkets produces snapshots array', () => {
    const out = shrinkOddsMarkets({
      response: [{ fixture: { id: 1 }, bookmakers: [{ id: 8, name: 'Bet', bets: [] }] }],
    });
    expect(Array.isArray((out as { snapshots: unknown[] }).snapshots)).toBe(true);
  });
});
