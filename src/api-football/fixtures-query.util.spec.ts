import {
  buildFixturesQueryParams,
} from './api-football.service';

describe('buildFixturesQueryParams', () => {
  it('omits page by default', () => {
    expect(buildFixturesQueryParams({ league: 39, season: 2025 })).toEqual({
      league: 39,
      season: 2025,
    });
  });

  it('includes page only when explicitly set', () => {
    expect(
      buildFixturesQueryParams({ league: 1, season: 2026, page: 2 }),
    ).toEqual({
      league: 1,
      season: 2026,
      page: 2,
    });
  });
});
