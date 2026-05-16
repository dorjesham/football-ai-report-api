import { computeClubTpr, computeNationalTpr, eloToScore } from './team-tpr.calculator';

describe('team-tpr (OLS 文档一 §3)', () => {
  it('eloToScore maps mid Elo near 50', () => {
    expect(eloToScore(1500)).toBeGreaterThan(45);
    expect(eloToScore(1500)).toBeLessThan(56);
  });

  it('computeClubTpr returns bounded tpr', () => {
    const r = computeClubTpr({
      kind: 'club',
      eloRating: 1650,
      leagueRank: 3,
      points: 62,
      recentForm: 'WWWDW',
      attackRating: 72,
      defenseRating: 68,
      squadQualityScore: 70,
      tacticalStabilityScore: 54,
      availabilityScore: 88,
      fatigueScore: 80,
    });
    expect(r.tpr).toBeGreaterThanOrEqual(32);
    expect(r.tpr).toBeLessThanOrEqual(99);
    expect(r.components.eloScore).toBeDefined();
  });

  it('computeNationalTpr uses national weights', () => {
    const r = computeNationalTpr({
      kind: 'national',
      eloRating: 1880,
      leagueRank: null,
      points: null,
      recentForm: 'WDWWW',
      attackRating: 78,
      defenseRating: 76,
      squadQualityScore: 75,
      tacticalStabilityScore: 55,
      availabilityScore: 90,
      fatigueScore: 85,
      tournamentExperienceScore: 80,
      clubFormAggregationScore: 72,
    });
    expect(r.tpr).toBeGreaterThan(50);
    expect(r.components.fifaEloScore).toBeDefined();
  });
});
