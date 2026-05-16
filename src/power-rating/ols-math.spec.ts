import { homeWinTendencyFromPowerDiff, poissonProbability } from './ols-math';

describe('ols-math', () => {
  it('poissonProbability sums roughly to 1 for small lambda', () => {
    let s = 0;
    for (let g = 0; g <= 8; g++) s += poissonProbability(1.2, g);
    expect(s).toBeGreaterThan(0.99);
    expect(s).toBeLessThanOrEqual(1.01);
  });

  it('homeWinTendencyFromPowerDiff matches logistic', () => {
    const t = homeWinTendencyFromPowerDiff(15, 12);
    expect(t).toBeGreaterThan(0.7);
    expect(t).toBeLessThan(0.85);
  });
});
