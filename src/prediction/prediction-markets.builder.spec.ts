import { buildPredictionMarkets, pickBestOddsSnapshot } from './prediction-markets.builder';

describe('pickBestOddsSnapshot', () => {
  it('prefers T1 over T24', () => {
    const t24 = {
      id: 'a',
      phase: 'T24',
      marketsJson: {},
      capturedAt: new Date('2026-01-01'),
    };
    const t1 = {
      id: 'b',
      phase: 'T1',
      marketsJson: {},
      capturedAt: new Date('2026-01-02'),
    };
    expect(pickBestOddsSnapshot([t24, t1])?.id).toBe('b');
  });
});

describe('buildPredictionMarkets', () => {
  it('builds model-only markets when no odds snapshot', () => {
    const out = buildPredictionMarkets({
      homeWinProbability: 42,
      drawProbability: 28,
      awayWinProbability: 30,
      totalExpectedGoals: 2.6,
      homeMatchPower: 68,
      awayMatchPower: 58,
      oddsSnapshot: null,
    });
    expect(out.schema).toBe('prediction-markets-v1');
    expect(out.oddsSnapshotId).toBeNull();
    expect((out.markets['1X2'] as { model: { H: number } }).model.H).toBe(42);
    expect(out.markets.OU_2_5).toBeTruthy();
  });
});
