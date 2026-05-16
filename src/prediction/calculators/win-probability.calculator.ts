import { clamp } from '../../common/utils/clamp';
import { normalizeThreeWayProbs } from '../../common/utils/normalize-probability';

export type WinProbInput = {
  homeElo: number;
  awayElo: number;
  homeAdvantageElo: number;
  homeRecentFormScore: number;
  awayRecentFormScore: number;
  homeAttackRating: number;
  awayAttackRating: number;
  homeDefenseRating: number;
  awayDefenseRating: number;
  homeInjuryImpact: number;
  awayInjuryImpact: number;
  homeFatigueIndex: number;
  awayFatigueIndex: number;
  weatherImpactScore: number;
};

export function recentFormToScore(form: string | null | undefined): number {
  if (!form) return 50;
  const chars = form.slice(-5).toUpperCase().split('');
  let pts = 0;
  for (const c of chars) {
    if (c === 'W') pts += 3;
    else if (c === 'D') pts += 1;
  }
  return (pts / 15) * 100;
}

export function calculateWinProbabilities(input: WinProbInput) {
  const homeScore =
    input.homeElo +
    input.homeAdvantageElo +
    input.homeRecentFormScore * 1.8 +
    input.homeAttackRating * 1.2 +
    input.homeDefenseRating * 1.0 -
    input.homeInjuryImpact * 1.5 -
    input.homeFatigueIndex * 1.2 -
    input.weatherImpactScore * 0.3;

  const awayScore =
    input.awayElo +
    input.awayRecentFormScore * 1.8 +
    input.awayAttackRating * 1.2 +
    input.awayDefenseRating * 1.0 -
    input.awayInjuryImpact * 1.5 -
    input.awayFatigueIndex * 1.2 -
    input.weatherImpactScore * 0.3;

  const scoreDiff = homeScore - awayScore;
  const homeEdge = 1 / (1 + Math.exp(-scoreDiff / 220));

  const baseDraw = 0.26;
  const drawPenalty = Math.min(Math.abs(scoreDiff) / 1000, 0.1);
  let drawProbability = baseDraw - drawPenalty;
  drawProbability = clamp(drawProbability, 0.16, 0.3);

  const remaining = 1 - drawProbability;
  let homeWin = remaining * homeEdge;
  let awayWin = remaining * (1 - homeEdge);

  let h = Math.round(homeWin * 100);
  let d = Math.round(drawProbability * 100);
  let a = Math.round(awayWin * 100);
  const norm = normalizeThreeWayProbs(h, d, a);

  const factorBreakdown = {
    eloDiff: input.homeElo - input.awayElo,
    homeAdvantageElo: input.homeAdvantageElo,
    recentFormImpact:
      input.homeRecentFormScore >= input.awayRecentFormScore
        ? '主队近5场状态略优或持平'
        : '客队近5场状态略优或持平',
    attackDefenseImpact: '基于双方进攻/防守评分估算',
    injuryImpact: '基于伤病影响指数',
    fatigueImpact: '基于赛程疲劳指数',
    weatherImpact: '天气影响已计入模型',
    modelNote: '该结果为简化模型估算，不代表赛果保证',
  };

  return {
    homeWinProbability: norm.home,
    drawProbability: norm.draw,
    awayWinProbability: norm.away,
    factorBreakdown,
  };
}
