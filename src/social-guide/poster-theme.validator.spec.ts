import { assertFootballPosterTheme } from './poster-theme.validator';

describe('assertFootballPosterTheme', () => {
  it('accepts club name', () => {
    expect(assertFootballPosterTheme('英超曼城主场')).toBe('英超曼城主场');
  });

  it('rejects off-topic', () => {
    expect(() => assertFootballPosterTheme('股票大涨')).toThrow();
  });
});
