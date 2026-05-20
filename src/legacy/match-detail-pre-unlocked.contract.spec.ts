import { buildMatchDetailPreUnlockedUi } from './match-detail-pre-unlocked.builder';
import { MATCH_DETAIL_PRE_UNLOCKED_SCHEMA_V1 } from '../match-phase/match-detail-pre-unlocked.types';

describe('match-detail-pre-unlocked-v1', () => {
  const preview = {
    homeWinProbability: 48,
    drawProbability: 24,
    awayWinProbability: 28,
    homeExpectedGoals: 1.7,
    awayExpectedGoals: 1.3,
    totalExpectedGoals: 3.0,
    totalGoalsTrend: '偏活跃',
    tempoIndex: 72,
    upsetIndex: 35,
    homeMatchPower: 62,
    awayMatchPower: 58,
    confidence: 60,
    dataQuality: 'MODEL_ESTIMATED',
  };

  const baseMatch = {
    id: 'm1',
    homeTeam: { id: 'h', nameCn: '切尔西', nameEn: 'Chelsea', logoUrl: null, powerRating: 70 },
    awayTeam: { id: 'a', nameCn: '热刺', nameEn: 'Spurs', logoUrl: null, powerRating: 68 },
    competition: { nameCn: '英超', code: 'PL' },
    teamSnapshots: [
      {
        isHome: true,
        recentForm: 'WWDLW',
        attackRating: 55,
        defenseRating: 50,
        formation: '4-3-3',
      },
      {
        isHome: false,
        recentForm: 'WDWLW',
        attackRating: 52,
        defenseRating: 48,
        formation: '4-2-3-1',
      },
    ],
    playerSnapshots: [],
    playerIntelligence: [],
    tacticalScenarios: [],
    headToHead: null,
    socialGuide: null,
    refereeSnapshot: null,
    aiReports: [],
  } as never;

  it('exposes all section keys when unlocked', () => {
    const ui = buildMatchDetailPreUnlockedUi({
      match: baseMatch,
      preview,
      predictionMarkets: {
        schema: 'prediction-markets-v1',
        markets: {
          SCORE_TOP6: {
            items: [
              { score: '2-1', probabilityPct: 18 },
              { score: '1-1', probabilityPct: 14 },
              { score: '2-0', probabilityPct: 12 },
              { score: '1-0', probabilityPct: 11 },
              { score: '3-1', probabilityPct: 9 },
              { score: '1-2', probabilityPct: 8 },
            ],
          },
          OU_2_5: { modelOverProb: 62, line: 2.5 },
          BTTS: { yesPct: 68 },
          CLEAN_SHEET: { homePct: 28, awayPct: 22 },
          AH_m0_5: { line: -0.5, modelHomeCoverProb: 55, handicapLabel: '切尔西让0.5球' },
        },
      },
      supplementaryFacts: null,
      homeInjuries: [],
      awayInjuries: [],
      oddsSnapshots: [],
      isAdmin: true,
    });

    expect(ui.schema).toBe(MATCH_DETAIL_PRE_UNLOCKED_SCHEMA_V1);
    expect(ui.sections.scorePrediction.topScores.length).toBeGreaterThanOrEqual(6);
    expect(ui.sections.scorePrediction.markets.btts.yesPct).toBe(68);
    expect(ui.sections.extendedMarkets.halfFullTime.length).toBeGreaterThan(0);
    expect(ui.sections.deepIntel.firstGoalMethod.length).toBeGreaterThan(0);
    expect(ui.sections.tacticalComparison.rows.length).toBe(5);
    expect(ui.dataAvailability.scorePrediction).toBe('present');
    expect(ui.sections.analysisTabs.preMatch.tags).toEqual([]);
    const hfSum = ui.sections.extendedMarkets.halfFullTime.reduce(
      (s, x) => s + x.probabilityPct,
      0,
    );
    expect(hfSum).toBeGreaterThan(50);
    expect(hfSum).toBeLessThanOrEqual(105);
    expect(ui.sections.extendedMarkets.dataQuality).toBe('MODEL_ESTIMATED');
  });
});
