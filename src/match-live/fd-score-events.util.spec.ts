import { syntheticGoalsFromScoreDelta } from './fd-score-events.util';

describe('syntheticGoalsFromScoreDelta', () => {
  it('emits goals when home score increases', () => {
    const out = syntheticGoalsFromScoreDelta({
      prevHome: 0,
      prevAway: 0,
      home: 2,
      away: 0,
    });
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.teamSide === 'home')).toBe(true);
  });

  it('no events when score unchanged', () => {
    const out = syntheticGoalsFromScoreDelta({
      prevHome: 1,
      prevAway: 1,
      home: 1,
      away: 1,
    });
    expect(out).toHaveLength(0);
  });
});
