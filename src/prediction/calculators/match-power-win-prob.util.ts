import { clamp } from '../../common/utils/clamp';
import { normalizeThreeWayProbs } from '../../common/utils/normalize-probability';

export type MatchPowerWinProbInput = {
  homeMatchPower: number;
  awayMatchPower: number;
};

/** OLS matchPower (30–99) → 1X2 概率，与 Elo 路径共用 logistic + 固定平局带 */
export function matchPowerToWinProb(input: MatchPowerWinProbInput) {
  const home = clamp(input.homeMatchPower, 30, 99);
  const away = clamp(input.awayMatchPower, 30, 99);
  const scoreDiff = home - away;
  const homeEdge = 1 / (1 + Math.exp(-scoreDiff / 12));

  const baseDraw = 0.26;
  const drawPenalty = Math.min(Math.abs(scoreDiff) / 80, 0.1);
  let drawProbability = clamp(baseDraw - drawPenalty, 0.16, 0.3);

  const remaining = 1 - drawProbability;
  const homeWin = remaining * homeEdge;
  const awayWin = remaining * (1 - homeEdge);

  const norm = normalizeThreeWayProbs(
    Math.round(homeWin * 100),
    Math.round(drawProbability * 100),
    Math.round(awayWin * 100),
  );

  return {
    homeWinProbability: norm.home,
    drawProbability: norm.draw,
    awayWinProbability: norm.away,
    factorBreakdown: {
      winProbSource: 'OLS_MATCH_POWER_V3' as const,
      homeMatchPower: home,
      awayMatchPower: away,
      scoreDiff,
      modelNote: '1X2 主信号来自 OLS 单场战力差',
    },
  };
}
