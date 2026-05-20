import { PREFERENCES_DEFAULTS } from './dto/preferences.dto';

describe('preferences defaults', () => {
  it('exposes empty arrays for followed leagues and competitions', () => {
    expect(PREFERENCES_DEFAULTS.followedLeagues).toEqual([]);
    expect(PREFERENCES_DEFAULTS.followedCompetitionIds).toEqual([]);
  });
});
