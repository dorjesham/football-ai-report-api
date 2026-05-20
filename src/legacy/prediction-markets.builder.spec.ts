import {
  bttsYesPct,
  buildPredictionMarkets,
  cleanSheetPct,
  pickBestOddsSnapshot,
} from './prediction-markets.builder';

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
      homeExpectedGoals: 1.5,
      awayExpectedGoals: 1.1,
      homeMatchPower: 68,
      awayMatchPower: 58,
      homeNameCn: '主队',
      oddsSnapshot: null,
    });
    expect(out.schema).toBe('prediction-markets-v1');
    expect(out.oddsSnapshotId).toBeNull();
    expect((out.markets['1X2'] as { model: { H: number } }).model.H).toBe(42);
    expect(out.markets.OU_2_5).toBeTruthy();
    expect(out.markets.BTTS).toBeTruthy();
    expect(out.markets.CLEAN_SHEET).toBeTruthy();
    const top6 = out.markets.SCORE_TOP6 as { items: unknown[] };
    expect(top6.items.length).toBeGreaterThanOrEqual(6);
  });

  it('computes BTTS and clean sheet from xG', () => {
    expect(bttsYesPct(1.8, 1.2)).toBeGreaterThan(50);
    const cs = cleanSheetPct(1.8, 1.2);
    expect(cs.homePct).toBeGreaterThan(0);
    expect(cs.awayPct).toBeGreaterThan(0);
  });
});
