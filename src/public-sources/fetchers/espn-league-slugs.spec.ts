import { resolveEspnSoccerSlug } from './espn-league-slugs';

describe('resolveEspnSoccerSlug', () => {
  it('maps PL and CL', () => {
    expect(resolveEspnSoccerSlug({ competition: { code: 'PL' }, tournament: null })).toBe('eng.1');
    expect(resolveEspnSoccerSlug({ competition: { code: 'CL' }, tournament: null })).toBe(
      'uefa.champions',
    );
  });

  it('falls back to tournament code', () => {
    expect(
      resolveEspnSoccerSlug({ competition: { code: null }, tournament: { code: 'UEFA_CL' } }),
    ).toBe('uefa.champions');
  });

  it('returns null when unknown', () => {
    expect(resolveEspnSoccerSlug({ competition: { code: 'XYZ' }, tournament: null })).toBeNull();
  });
});
