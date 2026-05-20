import { asRecord } from './af-fixture-match-fields.util';

export type AfPredictionMapped = {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  totalExpectedGoals: number;
  totalGoalsTrend: string;
  tempoIndex: number;
  upsetIndex: number;
  confidence: number;
  explanation: string;
  factorBreakdown: Record<string, unknown>;
  warnings: string[];
};

const MODEL_VERSION = 'af-v1';

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 解析 "45%" / 45 → 整数概率 */
export function parsePercentInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.round(Math.min(100, Math.max(0, v)));
  }
  if (typeof v === 'string') {
    const m = /(\d+(?:\.\d+)?)/.exec(v.trim());
    if (m) return Math.round(Math.min(100, Math.max(0, Number(m[1]))));
  }
  return null;
}

function parseGoalsSide(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normalizeProbabilities(
  home: number | null,
  draw: number | null,
  away: number | null,
  warnings: string[],
): { home: number; draw: number; away: number } {
  if (home == null && draw == null && away == null) {
    warnings.push('AF percent missing; using 33/33/34');
    return { home: 33, draw: 33, away: 34 };
  }
  let h = home ?? 0;
  let d = draw ?? 0;
  let a = away ?? 0;
  const sum = h + d + a;
  if (sum <= 0) {
    warnings.push('AF percent sum zero; using 33/33/34');
    return { home: 33, draw: 33, away: 34 };
  }
  if (Math.abs(sum - 100) > 2) {
    h = Math.round((h / sum) * 100);
    d = Math.round((d / sum) * 100);
    a = 100 - h - d;
    warnings.push(`AF percent normalized from sum=${sum}`);
  }
  return { home: h, draw: d, away: a };
}

function totalGoalsTrend(total: number): string {
  if (total >= 3.0) return '总进球趋势偏活跃';
  if (total >= 2.4) return '总进球趋势中性偏活跃';
  if (total >= 2.0) return '总进球趋势中性';
  return '总进球趋势偏谨慎';
}

/**
 * 将 API-Football `GET /predictions?fixture=` 的 `response` 映射为 MatchPrediction 写入字段。
 */
export function mapApiFootballPredictionsResponse(
  response: unknown[],
): AfPredictionMapped | null {
  const first = response[0];
  const wrap = asRecord(first);
  if (!wrap) return null;
  const preds = asRecord(wrap.predictions);
  if (!preds) return null;

  const warnings: string[] = [];
  const percent = asRecord(preds.percent);
  const probs = normalizeProbabilities(
    parsePercentInt(percent?.home),
    parsePercentInt(percent?.draw),
    parsePercentInt(percent?.away),
    warnings,
  );

  const goals = asRecord(preds.goals);
  const homeEg = parseGoalsSide(goals?.home);
  const awayEg = parseGoalsSide(goals?.away);
  const homeExpectedGoals = homeEg ?? 1.35;
  const awayExpectedGoals = awayEg ?? 1.15;
  if (homeEg == null || awayEg == null) {
    warnings.push('AF goals missing or invalid; using defaults for xG');
  }
  const totalExpectedGoals =
    Math.round((homeExpectedGoals + awayExpectedGoals) * 100) / 100;

  const winner = asRecord(preds.winner);
  const advice =
    (typeof preds.advice === 'string' && preds.advice.trim()) ||
    (typeof winner?.comment === 'string' && winner.comment.trim()) ||
    '';
  const winnerName =
    typeof winner?.name === 'string' ? winner.name.trim() : null;

  const explanation = [
    advice || 'API-Football 赛前预测',
    winnerName ? `倾向：${winnerName}` : null,
  ]
    .filter(Boolean)
    .join('；');

  const spread = Math.max(probs.home, probs.draw, probs.away) - Math.min(
    probs.home,
    probs.draw,
    probs.away,
  );
  const confidence = Math.max(40, Math.min(88, 55 + Math.round(spread / 2)));

  return {
    homeWinProbability: probs.home,
    drawProbability: probs.draw,
    awayWinProbability: probs.away,
    homeExpectedGoals,
    awayExpectedGoals,
    totalExpectedGoals,
    totalGoalsTrend: totalGoalsTrend(totalExpectedGoals),
    tempoIndex: Math.min(
      100,
      Math.max(0, Math.round((totalExpectedGoals / 3.5) * 100)),
    ),
    upsetIndex: Math.min(100, Math.max(0, 100 - spread * 2)),
    confidence,
    explanation,
    factorBreakdown: {
      winProbSource: 'API_FOOTBALL',
      modelVersion: MODEL_VERSION,
      afRaw: preds,
      winner: winner ?? undefined,
      underOver: preds.under_over ?? preds.underOver,
      winOrDraw: preds.win_or_draw,
      warnings: warnings.length ? warnings : undefined,
    },
    warnings,
  };
}

export { MODEL_VERSION as AF_PREDICTION_MODEL_VERSION };
