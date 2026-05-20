import { asRecord } from '../api-football/af-fixture-match-fields.util';
import { parsePercentInt } from '../api-football/af-prediction.mapper';

export type AfComparisonSidePair = {
  home: string;
  away: string;
};

export type AfTeamComparisonSummary = {
  available: boolean;
  percent: { home: number; draw: number; away: number } | null;
  comparison: {
    form?: AfComparisonSidePair;
    att?: AfComparisonSidePair;
    def?: AfComparisonSidePair;
    goals?: AfComparisonSidePair;
    total?: AfComparisonSidePair;
  } | null;
  advice: string | null;
};

function parseSidePair(v: unknown): AfComparisonSidePair | undefined {
  const row = asRecord(v);
  if (!row) return undefined;
  const home = row.home != null ? String(row.home).trim() : '';
  const away = row.away != null ? String(row.away).trim() : '';
  if (!home && !away) return undefined;
  return { home: home || '—', away: away || '—' };
}

function parseComparisonBlock(
  comparison: Record<string, unknown>,
): AfTeamComparisonSummary['comparison'] {
  const form = parseSidePair(comparison.form);
  const att = parseSidePair(comparison.att);
  const def = parseSidePair(comparison.def);
  const goals = parseSidePair(comparison.goals);
  const total = parseSidePair(comparison.total);
  if (!form && !att && !def && !goals && !total) return null;
  return {
    ...(form ? { form } : {}),
    ...(att ? { att } : {}),
    ...(def ? { def } : {}),
    ...(goals ? { goals } : {}),
    ...(total ? { total } : {}),
  };
}

/**
 * 从 MatchAfRawBundle.predictionsJson（AF GET /predictions response[0]）提取实力对比摘要。
 */
export function extractAfTeamComparison(
  predictionsJson: unknown,
): AfTeamComparisonSummary {
  const root = asRecord(predictionsJson);
  if (!root) {
    return {
      available: false,
      percent: null,
      comparison: null,
      advice: null,
    };
  }

  const predictions = asRecord(root.predictions);
  const percentRow = asRecord(predictions?.percent);
  const homeP = parsePercentInt(percentRow?.home);
  const drawP = parsePercentInt(percentRow?.draw);
  const awayP = parsePercentInt(percentRow?.away);
  const percent =
    homeP != null && drawP != null && awayP != null
      ? { home: homeP, draw: drawP, away: awayP }
      : null;

  const comparisonRoot = asRecord(root.comparison);
  const comparison = comparisonRoot
    ? parseComparisonBlock(comparisonRoot)
    : null;

  const advice =
    typeof predictions?.advice === 'string' && predictions.advice.trim()
      ? predictions.advice.trim()
      : null;

  const available = comparison != null && Object.keys(comparison).length > 0;

  return {
    available,
    percent,
    comparison,
    advice,
  };
}
