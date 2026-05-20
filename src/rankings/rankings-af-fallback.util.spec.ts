import { normalizeTopscorersResponse } from './rankings-af-fallback.util';

describe('normalizeTopscorersResponse', () => {
  it('maps AF topscorer row', () => {
    const rows = normalizeTopscorersResponse(
      [
        {
          player: { id: 10, name: 'Salah', photo: 'https://x/p.png' },
          statistics: [
            {
              team: { id: 40, name: 'Liverpool', logo: 'https://x/t.png' },
              games: { position: 'FW', minutes: 900 },
              goals: { total: 15 },
            },
          ],
        },
      ],
      'goals',
    );
    expect(rows[0].goals).toBe(15);
    expect(rows[0].playerId).toBe('af-p-10');
    expect(rows[0].teamName).toBe('Liverpool');
  });
});
