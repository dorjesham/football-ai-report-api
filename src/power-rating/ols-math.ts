/** 与根目录《战力算法.md》文档一 §10 对齐的数值工具 */

export function weightedSum(items: { score: number; weight: number }[]): number {
  return items.reduce((sum, item) => sum + item.score * item.weight, 0);
}

export function round1(value: number): number {
  return Number(value.toFixed(1));
}

export function round3(value: number): number {
  return Number(value.toFixed(3));
}

export function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

export function poissonProbability(lambda: number, goals: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, goals)) / factorial(goals);
}

export type ScoreDistItem = {
  homeGoals: number;
  awayGoals: number;
  score: string;
  probability: number;
};

export type ScoreDistributionResult = {
  probabilities: { homeWin: number; draw: number; awayWin: number };
  scoreDistribution: ScoreDistItem[];
};

/** 文档 §10.3：比分联合分布与胜平负概率 */
export function calculateScoreDistribution(
  homeXG: number,
  awayXG: number,
  maxGoals = 6,
): ScoreDistributionResult {
  const scores: ScoreDistItem[] = [];
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const homeProb = poissonProbability(homeXG, h);
    for (let a = 0; a <= maxGoals; a++) {
      const awayProb = poissonProbability(awayXG, a);
      const prob = homeProb * awayProb;
      scores.push({
        homeGoals: h,
        awayGoals: a,
        score: `${h}-${a}`,
        probability: prob,
      });
      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;
    }
  }

  const total = homeWin + draw + awayWin;
  if (total <= 0) {
    return {
      probabilities: { homeWin: 0.33, draw: 0.34, awayWin: 0.33 },
      scoreDistribution: [],
    };
  }

  return {
    probabilities: {
      homeWin: round3(homeWin / total),
      draw: round3(draw / total),
      awayWin: round3(awayWin / total),
    },
    scoreDistribution: scores
      .map((item) => ({
        ...item,
        probability: Number((item.probability / total).toFixed(4)),
      }))
      .sort((a, b) => b.probability - a.probability),
  };
}

/** 文档 §5.2 Logistic，Scale=12 */
export function homeWinTendencyFromPowerDiff(powerDiff: number, scale = 12): number {
  return 1 / (1 + Math.exp(-powerDiff / scale));
}
