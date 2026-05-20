import { extractAfTeamComparison } from './af-predictions-comparison.util';

describe('extractAfTeamComparison', () => {
  it('returns available when comparison has form/att pairs', () => {
    const summary = extractAfTeamComparison({
      predictions: {
        percent: { home: '55%', draw: '20%', away: '25%' },
        advice: 'Home or draw',
      },
      comparison: {
        form: { home: '80%', away: '55%' },
        att: { home: '72%', away: '68%' },
      },
    });
    expect(summary.available).toBe(true);
    expect(summary.percent).toEqual({ home: 55, draw: 20, away: 25 });
    expect(summary.comparison?.form).toEqual({ home: '80%', away: '55%' });
    expect(summary.advice).toBe('Home or draw');
  });

  it('returns unavailable when comparison missing', () => {
    const summary = extractAfTeamComparison({
      predictions: { percent: { home: '40%', draw: '30%', away: '30%' } },
    });
    expect(summary.available).toBe(false);
    expect(summary.comparison).toBeNull();
    expect(summary.percent).toEqual({ home: 40, draw: 30, away: 30 });
  });

  it('handles null input', () => {
    const summary = extractAfTeamComparison(null);
    expect(summary.available).toBe(false);
    expect(summary.percent).toBeNull();
  });
});
