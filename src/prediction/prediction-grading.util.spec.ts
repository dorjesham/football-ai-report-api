import {
  brierScore1x2,
  flatRoi1x2,
  resolveActualOutcome1x2,
  top1x2Pick,
} from './prediction-grading.util';

describe('prediction-grading.util', () => {
  it('resolves 1X2 outcome', () => {
    expect(resolveActualOutcome1x2(2, 1)).toBe('H');
    expect(resolveActualOutcome1x2(0, 0)).toBe('D');
  });

  it('computes Brier and hit', () => {
    const probs = { H: 50, D: 25, A: 25 };
    expect(top1x2Pick(probs)).toBe('H');
    expect(brierScore1x2(probs, 'H')).toBeLessThan(brierScore1x2(probs, 'A'));
  });

  it('flat ROI win/loss', () => {
    expect(flatRoi1x2({ pick: 'H', actual: 'H', odds: { H: 2.1 } })).toBeCloseTo(1.1);
    expect(flatRoi1x2({ pick: 'H', actual: 'A', odds: { H: 2.1 } })).toBe(-1);
  });
});
