import { matchPowerToWinProb } from './match-power-win-prob.util';

describe('matchPowerToWinProb', () => {
  it('对称战力 → 接近均衡', () => {
    const r = matchPowerToWinProb({ homeMatchPower: 65, awayMatchPower: 65 });
    expect(r.homeWinProbability + r.drawProbability + r.awayWinProbability).toBe(100);
    expect(Math.abs(r.homeWinProbability - r.awayWinProbability)).toBeLessThanOrEqual(8);
    expect(r.drawProbability).toBeGreaterThanOrEqual(16);
  });

  it('明显强弱差 → 主胜升高', () => {
    const r = matchPowerToWinProb({ homeMatchPower: 82, awayMatchPower: 48 });
    expect(r.homeWinProbability).toBeGreaterThan(r.awayWinProbability + 15);
    expect(r.factorBreakdown.winProbSource).toBe('OLS_MATCH_POWER_V3');
  });
});
