import {
  afBundleToPredictionDetail,
  afBundleToPredictionPreview,
} from './match-intel-af-bundle.util';

describe('match-intel-af-bundle.util', () => {
  const sample = {
    predictions: {
      percent: { home: '45%', draw: '25%', away: '30%' },
      goals: { home: '1.8', away: '1.2' },
      advice: 'Double chance : home or draw',
      under_over: '+2.5',
    },
    teams: { home: { name: 'A' }, away: { name: 'B' } },
  };

  it('maps AF percent to preview probabilities', () => {
    const p = afBundleToPredictionPreview(sample);
    expect(p).not.toBeNull();
    expect(p!.homeWinProbability).toBeCloseTo(0.45, 2);
    expect(p!.drawProbability).toBeCloseTo(0.25, 2);
    expect(p!.awayWinProbability).toBeCloseTo(0.3, 2);
    expect(p!.homeMatchPower).toBeNull();
  });

  it('detail has no predictionMarkets and api-football source', () => {
    const d = afBundleToPredictionDetail(sample);
    expect(d!.predictionMarkets).toBeNull();
    expect(d!.modelVersion).toBe('af-v1');
    expect(d!.explanation).toContain('home or draw');
  });
});
