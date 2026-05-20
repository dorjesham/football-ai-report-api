import {
  mapApiFootballPredictionsResponse,
  parsePercentInt,
} from './af-prediction.mapper';

describe('af-prediction.mapper', () => {
  it('parsePercentInt handles percent strings', () => {
    expect(parsePercentInt('45%')).toBe(45);
    expect(parsePercentInt(30)).toBe(30);
  });

  it('maps AF predictions response to probabilities and xG', () => {
    const mapped = mapApiFootballPredictionsResponse([
      {
        predictions: {
          winner: { id: 1, name: 'Arsenal', comment: 'Win or draw' },
          advice: 'Double chance : Arsenal or draw',
          percent: { home: '55%', draw: '25%', away: '20%' },
          goals: { home: '1.8', away: '0.9' },
        },
      },
    ]);
    expect(mapped).not.toBeNull();
    expect(mapped!.homeWinProbability).toBe(55);
    expect(mapped!.drawProbability).toBe(25);
    expect(mapped!.awayWinProbability).toBe(20);
    expect(mapped!.homeExpectedGoals).toBe(1.8);
    expect(mapped!.awayExpectedGoals).toBe(0.9);
    expect(mapped!.explanation).toContain('Arsenal');
    expect(mapped!.factorBreakdown.winProbSource).toBe('API_FOOTBALL');
  });

  it('uses defaults when percent missing', () => {
    const mapped = mapApiFootballPredictionsResponse([
      { predictions: { advice: 'No clear favorite' } },
    ]);
    expect(mapped!.homeWinProbability).toBe(33);
    expect(mapped!.warnings.length).toBeGreaterThan(0);
  });
});
