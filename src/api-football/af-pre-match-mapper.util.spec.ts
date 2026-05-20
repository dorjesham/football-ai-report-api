import { mapTeamStatistics } from './af-pre-match-mapper.util';

describe('mapTeamStatistics', () => {
  it('returns null ratings when statistics missing', () => {
    const r = mapTeamStatistics(null);
    expect(r.attackRating).toBeNull();
    expect(r.defenseRating).toBeNull();
  });

  it('returns null ratings when goals averages unavailable', () => {
    const r = mapTeamStatistics({ form: 'WW' });
    expect(r.attackRating).toBeNull();
    expect(r.defenseRating).toBeNull();
  });
});
