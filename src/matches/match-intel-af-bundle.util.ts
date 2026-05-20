import { DataQuality, DataSourceType } from '@prisma/client';
import { asRecord } from '../api-football/af-fixture-match-fields.util';
import type {
  MatchIntelPredictionDetail,
  MatchIntelPredictionPreview,
} from './match-intel.types';

function parsePercent(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v / (v > 1 ? 100 : 1);
  if (typeof v === 'string') {
    const n = parseFloat(v.replace('%', '').trim());
    if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
  }
  return 0;
}

function parseGoals(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 从 MatchAfRawBundle.predictionsJson（AF response[0]）提取 intel 预测摘要 */
export function afBundleToPredictionPreview(
  bundleJson: unknown,
): MatchIntelPredictionPreview | null {
  const root = asRecord(bundleJson);
  if (!root) return null;
  const predictions = asRecord(root.predictions);
  if (!predictions) return null;
  const percent = asRecord(predictions.percent);
  const goals = asRecord(predictions.goals);
  const home = parsePercent(percent?.home);
  const draw = parsePercent(percent?.draw);
  const away = parsePercent(percent?.away);
  if (home + draw + away <= 0) return null;
  return {
    homeWinProbability: home,
    drawProbability: draw,
    awayWinProbability: away,
    homeExpectedGoals: parseGoals(goals?.home),
    awayExpectedGoals: parseGoals(goals?.away),
    totalExpectedGoals: parseGoals(goals?.home) + parseGoals(goals?.away),
    totalGoalsTrend: typeof predictions.under_over === 'string' ? predictions.under_over : null,
    tempoIndex: 0,
    upsetIndex: 0,
    homeMatchPower: null,
    awayMatchPower: null,
    confidence: Math.max(home, draw, away),
    dataQuality: DataQuality.PUBLIC_DATA,
  };
}

export function afBundleToPredictionDetail(
  bundleJson: unknown,
): MatchIntelPredictionDetail | null {
  const preview = afBundleToPredictionPreview(bundleJson);
  if (!preview) return null;
  const root = asRecord(bundleJson);
  const predictions = asRecord(root?.predictions);
  const advice =
    typeof predictions?.advice === 'string' ? predictions.advice : null;
  return {
    ...preview,
    modelVersion: 'af-v1',
    factorBreakdown: {
      source: 'api-football',
      afBundle: root,
    },
    explanation: advice,
    dataSource: DataSourceType.API_FOOTBALL,
    predictionMarkets: null,
  };
}
