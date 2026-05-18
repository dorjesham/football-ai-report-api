import { normalizeApiFootballStandingsResponse } from './af-standings.mapper';

describe('normalizeApiFootballStandingsResponse', () => {
  it('maps league standings tier to normalized rows', () => {
    const rows = normalizeApiFootballStandingsResponse([
      {
        league: {
          standings: [
            [
              {
                rank: 1,
                team: { id: 50, name: 'Man City', logo: 'https://x/logo.png' },
                all: {
                  played: 10,
                  win: 7,
                  draw: 2,
                  lose: 1,
                  goals: { for: 20, against: 5 },
                },
                goalsDiff: 15,
                points: 23,
              },
            ],
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rank: 1,
      teamId: 50,
      teamName: 'Man City',
      played: 10,
      wins: 7,
      draws: 2,
      losses: 1,
      goalsFor: 20,
      goalsAgainst: 5,
      goalDifference: 15,
      points: 23,
    });
  });
});
