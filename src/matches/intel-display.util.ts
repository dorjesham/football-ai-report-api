import type { AiReport, MatchPrediction } from '@prisma/client';
import type { MatchIntelTactic } from './match-intel.types';

/** 与 AiReport 落库占位文案一致（用于 C 端替换为可读摘要） */
export function isInternalAiReportFreeSummaryPlaceholder(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return true;
  const t = text.trim();
  return (
    t.startsWith('【占位】') ||
    t.includes('模型未返回 freeSummary') ||
    t.includes('草稿已落库')
  );
}

/**
 * 情报页「AI 核心结论」展示用：避免把运维占位句直接给小程序；
 * 优先已写入的 freeSummary，否则 dashboard / 预测说明 / 固定引导。
 */
export function resolveIntelFreeSummaryForDisplay(args: {
  report: Pick<AiReport, 'freeSummary' | 'dashboardSummary' | 'historicalInsight'> | null | undefined;
  prediction: Pick<MatchPrediction, 'explanation'> | null | undefined;
}): string {
  const { report, prediction } = args;
  const raw = report?.freeSummary?.trim() ?? '';
  if (raw && !isInternalAiReportFreeSummaryPlaceholder(raw)) {
    return raw;
  }
  const dash = report?.dashboardSummary?.trim();
  if (dash) return dash.slice(0, 2000);
  const hist = report?.historicalInsight?.trim();
  if (hist) return hist.slice(0, 2000);
  const expl = prediction?.explanation?.trim();
  if (expl) return expl.slice(0, 2000);
  return '赛前简报将随数据管线逐步丰富。请先查看上方胜率与球队战力；完赛或解锁后可浏览更完整的对阵与情报模块。';
}

type ReportTacticRow = {
  scenarioType?: string;
  title?: string;
  probability?: number;
  precondition?: string;
  process?: string;
  possibleScore?: string | null;
  timeline?: string | null;
};

function normalizeReportTacticsPayload(raw: unknown): ReportTacticRow[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === 'object') as ReportTacticRow[];
  }
  if (typeof raw === 'object' && raw !== null && 'scenarios' in raw) {
    const s = (raw as { scenarios?: unknown }).scenarios;
    if (Array.isArray(s)) return s.filter((x) => x && typeof x === 'object') as ReportTacticRow[];
  }
  return [];
}

/**
 * 当库内 TacticalScenario 为空时，尝试用 AiReport.tacticalScenarios（DeepSeek 报告 JSON）补全 intel 的 tactics 列表。
 */
export function tacticsFromAiReportJson(
  raw: unknown,
  opts?: { max?: number },
): MatchIntelTactic[] {
  const max = opts?.max ?? 3;
  const rows = normalizeReportTacticsPayload(raw).slice(0, max);
  return rows
    .map((row, i) => {
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!title) return null;
      const prob = Number.isFinite(row.probability) ? Math.round(row.probability as number) : 33;
      return {
        id: `ai-report-tactic-${i}`,
        scenarioType: typeof row.scenarioType === 'string' ? row.scenarioType : 'REPORT',
        title,
        probability: Math.min(100, Math.max(0, prob)),
        precondition:
          typeof row.precondition === 'string' && row.precondition.trim()
            ? row.precondition
            : '（来自 AI 报告 JSON）',
        process:
          typeof row.process === 'string' && row.process.trim()
            ? row.process
            : '详见报告其它章节或后台重新跑战术沙盘。',
        possibleScore:
          typeof row.possibleScore === 'string' && row.possibleScore.trim()
            ? row.possibleScore
            : null,
        timeline:
          typeof row.timeline === 'string' && row.timeline.trim() ? row.timeline : null,
      } as MatchIntelTactic;
    })
    .filter((x): x is MatchIntelTactic => x !== null);
}
