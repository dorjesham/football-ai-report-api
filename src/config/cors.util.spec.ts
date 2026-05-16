import { resolveCorsOrigin } from './cors.util';

describe('resolveCorsOrigin', () => {
  it('development allows * as reflect-any', () => {
    expect(resolveCorsOrigin('development', '*')).toBe(true);
  });

  it('production rejects *', () => {
    expect(() => resolveCorsOrigin('production', '*')).toThrow(/CORS_ORIGIN/);
  });

  it('production parses comma list', () => {
    expect(resolveCorsOrigin('production', 'https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
