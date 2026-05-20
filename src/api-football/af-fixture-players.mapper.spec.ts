import { mapAfFixturePlayersResponse } from './af-fixture-players.mapper';

describe('af-fixture-players.mapper', () => {
  it('maps statistics to table fields', () => {
    const rows = mapAfFixturePlayersResponse(
      [
      {
        team: { id: 1 },
        players: [
          {
            player: { id: 99, name: 'Test Player' },
            statistics: [
              {
                games: { minutes: 90 },
                type: 'Rating',
                value: '7.5',
              },
              { type: 'Goals', value: 1 },
              { type: 'Assists', value: 2 },
            ],
          },
        ],
      },
    ],
      1,
      2,
    );
    expect(rows[0]?.afPlayerId).toBe(99);
    expect(rows[0]?.goals).toBe(1);
    expect(rows[0]?.rating).toBe(7.5);
  });
});
