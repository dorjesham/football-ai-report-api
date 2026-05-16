import { clamp } from '../common/utils/clamp';
import { recentFormToScore } from '../prediction/calculators/win-probability.calculator';
import { round1, weightedSum } from './ols-math';

export type TeamTprKind = 'club' | 'national';

export type TeamTprInput = {
  kind: TeamTprKind;
  eloRating: number;
  leagueRank: number | null;
  points: number | null;
  recentForm: string | null;
  attackRating: number;
  defenseRating: number;
  squadQualityScore: number;
  tacticalStabilityScore: number;
  /** 阵容完整度 0–100，越高越好 */
  availabilityScore: number;
  /** 体能/赛程 0–100，越高越好 */
  fatigueScore: number;
  /** 国家队：大赛经验分；俱乐部可传 50 */
  tournamentExperienceScore?: number;
  /** 国家队：俱乐部状态聚合；默认用近期近似 */
  clubFormAggregationScore?: number;
};

/** Elo 约 1200–2000 → 约 30–95 分 */
export function eloToScore(elo: number): number {
  return clamp(50 + (elo - 1500) / 14, 28, 96);
}

export function leaguePerformanceScore(rank: number | null, points: number | null): number {
  if (rank != null && Number.isFinite(rank) && rank > 0) {
    return clamp(100 - (rank - 1) * 2.75, 32, 98);
  }
  if (points != null && Number.isFinite(points)) {
    return clamp(35 + (points / 100) * 55, 35, 92);
  }
  return 52;
}

export function computeClubTpr(input: TeamTprInput): { tpr: number; components: Record<string, number> } {
  const eloScore = eloToScore(input.eloRating);
  const leaguePerformanceScoreV = leaguePerformanceScore(input.leagueRank, input.points);
  const recentFormScore = recentFormToScore(input.recentForm);
  const attackScore = clamp(input.attackRating, 15, 98);
  const defenseScore = clamp(input.defenseRating, 15, 98);
  const squadQualityScore = clamp(input.squadQualityScore, 25, 96);
  const tacticalStabilityScore = clamp(input.tacticalStabilityScore, 25, 92);
  const availabilityScore = clamp(input.availabilityScore, 20, 100);
  const fatigueScore = clamp(input.fatigueScore, 20, 100);

  const tpr = round1(
    weightedSum([
      { score: eloScore, weight: 0.18 },
      { score: leaguePerformanceScoreV, weight: 0.12 },
      { score: recentFormScore, weight: 0.16 },
      { score: attackScore, weight: 0.14 },
      { score: defenseScore, weight: 0.14 },
      { score: squadQualityScore, weight: 0.12 },
      { score: tacticalStabilityScore, weight: 0.06 },
      { score: availabilityScore, weight: 0.04 },
      { score: fatigueScore, weight: 0.04 },
    ]),
  );

  return {
    tpr: clamp(tpr, 32, 99),
    components: {
      eloScore,
      leaguePerformanceScore: leaguePerformanceScoreV,
      recentFormScore,
      attackScore,
      defenseScore,
      squadQualityScore,
      tacticalStabilityScore,
      availabilityScore,
      fatigueScore,
    },
  };
}

export function computeNationalTpr(input: TeamTprInput): { tpr: number; components: Record<string, number> } {
  const fifaEloScore = eloToScore(input.eloRating);
  const squadQualityScore = clamp(input.squadQualityScore, 28, 96);
  const recentNationalFormScore = recentFormToScore(input.recentForm);
  const clubFormAggregationScore = clamp(
    input.clubFormAggregationScore ?? recentNationalFormScore * 0.95 + 3,
    30,
    96,
  );
  const attackScore = clamp(input.attackRating, 18, 98);
  const defenseScore = clamp(input.defenseRating, 18, 98);
  const tournamentExperienceScore = clamp(input.tournamentExperienceScore ?? 52, 28, 92);
  const tacticalCohesionScore = clamp(input.tacticalStabilityScore, 28, 90);
  const availabilityScore = clamp(input.availabilityScore, 22, 100);
  const fatigueScore = clamp(input.fatigueScore, 22, 100);

  const tpr = round1(
    weightedSum([
      { score: fifaEloScore, weight: 0.16 },
      { score: squadQualityScore, weight: 0.2 },
      { score: recentNationalFormScore, weight: 0.13 },
      { score: clubFormAggregationScore, weight: 0.13 },
      { score: attackScore, weight: 0.11 },
      { score: defenseScore, weight: 0.11 },
      { score: tournamentExperienceScore, weight: 0.07 },
      { score: tacticalCohesionScore, weight: 0.05 },
      { score: availabilityScore, weight: 0.04 },
      { score: fatigueScore, weight: 0.04 },
    ]),
  );

  return {
    tpr: clamp(tpr, 32, 99),
    components: {
      fifaEloScore,
      squadQualityScore,
      recentNationalFormScore,
      clubFormAggregationScore,
      attackScore,
      defenseScore,
      tournamentExperienceScore,
      tacticalCohesionScore,
      availabilityScore,
      fatigueScore,
    },
  };
}

export function computeTeamBaseTpr(input: TeamTprInput): { tpr: number; components: Record<string, number> } {
  return input.kind === 'national' ? computeNationalTpr(input) : computeClubTpr(input);
}
