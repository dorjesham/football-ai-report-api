import {
  dedupeInjuryRows,
  normalizeInjuriesResponse,
} from './af-injuries.mapper';

describe('af-injuries.mapper', () => {
  it('reads type/reason from player object (API-Football canonical)', () => {
    const rows = normalizeInjuriesResponse([
      {
        player: {
          id: 865,
          name: 'D. Costa',
          type: 'Missing Fixture',
          reason: 'Broken ankle',
        },
        team: { id: 49, name: 'Chelsea' },
        fixture: { id: 1379333 },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerName: 'D. Costa',
      type: 'Missing Fixture',
      reason: 'Broken ankle',
      apiTeamId: 49,
      fixtureId: 1379333,
    });
  });

  it('dedupes by fixture+team+player+type+reason', () => {
    const row = {
      playerId: 1,
      playerName: 'A',
      type: 'Injury',
      reason: 'Knee',
      apiTeamId: 10,
      fixtureId: 99,
    };
    expect(dedupeInjuryRows([row, { ...row }])).toHaveLength(1);
  });

  it('falls back to rec.type when player.type absent', () => {
    const rows = normalizeInjuriesResponse([
      {
        type: 'Legacy Type',
        reason: 'Legacy Reason',
        player: { name: 'X' },
        team: { id: 1 },
      },
    ]);
    expect(rows[0].type).toBe('Legacy Type');
    expect(rows[0].reason).toBe('Legacy Reason');
  });
});
