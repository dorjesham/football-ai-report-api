import { clamp } from '../../common/utils/clamp';

export type XgInput = {
  homeGoalsForAvg: number;
  homeGoalsAgainstAvg: number;
  awayGoalsForAvg: number;
  awayGoalsAgainstAvg: number;
  homeXgAvg?: number | null;
  homeXgaAvg?: number | null;
  awayXgAvg?: number | null;
  awayXgaAvg?: number | null;
  leagueAvgGoals: number;
  homeAdvantage: number;
  awayAdjustment: number;
};

export function calculateExpectedGoals(input: XgInput) {
  const leagueAvgTeamGoals = input.leagueAvgGoals / 2;

  const useHomeAttack =
    input.homeXgAvg != null && input.homeXgAvg > 0 ? input.homeXgAvg : input.homeGoalsForAvg;
  const useAwayAttack =
    input.awayXgAvg != null && input.awayXgAvg > 0 ? input.awayXgAvg : input.awayGoalsForAvg;
  const useAwayDef =
    input.awayXgaAvg != null && input.awayXgaAvg > 0 ? input.awayXgaAvg : input.awayGoalsAgainstAvg;
  const useHomeDef =
    input.homeXgaAvg != null && input.homeXgaAvg > 0 ? input.homeXgaAvg : input.homeGoalsAgainstAvg;

  const homeAttackStrength = clamp(useHomeAttack / leagueAvgTeamGoals, 0.2, 3);
  const awayAttackStrength = clamp(useAwayAttack / leagueAvgTeamGoals, 0.2, 3);
  const awayDefenceWeakness = clamp(useAwayDef / leagueAvgTeamGoals, 0.2, 3);
  const homeDefenceWeakness = clamp(useHomeDef / leagueAvgTeamGoals, 0.2, 3);

  const homeExpectedGoals =
    homeAttackStrength * awayDefenceWeakness * input.leagueAvgGoals * input.homeAdvantage;
  const awayExpectedGoals =
    awayAttackStrength * homeDefenceWeakness * input.leagueAvgGoals * input.awayAdjustment;

  const totalExpectedGoals = homeExpectedGoals + awayExpectedGoals;

  let totalGoalsTrend = '总进球趋势中性';
  if (totalExpectedGoals >= 3.0) totalGoalsTrend = '总进球趋势偏活跃';
  else if (totalExpectedGoals >= 2.4) totalGoalsTrend = '总进球趋势中性偏活跃';
  else if (totalExpectedGoals >= 2.0) totalGoalsTrend = '总进球趋势中性';
  else totalGoalsTrend = '总进球趋势偏谨慎';

  return {
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    totalExpectedGoals: Math.round(totalExpectedGoals * 100) / 100,
    totalGoalsTrend,
    explanation: '基于攻防强度与联赛场均进球的简化模型估算。',
  };
}
