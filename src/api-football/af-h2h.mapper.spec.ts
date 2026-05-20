import { mapHeadToHeadFixtures } from './af-h2h.mapper';

describe('mapHeadToHeadFixtures', () => {
  it('maps meetings and aggregate from AF fixture rows', () => {
    const response = [
      {
        fixture: { date: '2024-04-10T19:00:00+00:00' },
        league: { name: 'Premier League' },
        teams: {
          home: { id: 42, name: 'Arsenal' },
          away: { id: 47, name: 'Tottenham' },
        },
        goals: { home: 3, away: 2 },
      },
    ];
    const out = mapHeadToHeadFixtures(response, 42, '阿森纳');
    expect(out.meetings).toHaveLength(1);
    expect(out.aggregate.homeWins).toBe(1);
    expect(out.meetings[0].homeScore).toBe(3);
  });
});
