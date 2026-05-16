/**
 * CI 验收脚本共享：CI_STRICT / CI_RELEASE 与 exit 0|1|2 语义。
 * 见 scripts/ci-exit-codes.md
 */

export function isCiStrict(): boolean {
  return process.env.CI_STRICT === '1';
}

export function isCiRelease(): boolean {
  return process.env.CI_RELEASE === '1';
}

export function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export function envFloat(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

/** 未达阈值：CI_STRICT=1 时 exit 1，否则仅告警 */
export function failThreshold(message: string): void {
  if (isCiStrict()) {
    console.error(`[CI_STRICT] ${message}`);
    process.exit(1);
  }
  console.warn(`[CI warn] ${message}`);
}

/** 无样本 / 无数据：exit 2（由 ci-run-l1-suite 在 nightly 下降级为 warning） */
export function exitNoData(reason: string): never {
  console.warn(`[CI no-data] ${reason}`);
  process.exit(2);
}

export const CI_THRESHOLDS = {
  liveSyncP95MaxMs: () => envInt('LIVE_SYNC_P95_MAX_MS', 60_000),
  reportFactCheckMinPassRate: () =>
    envFloat('REPORT_FACT_CHECK_MIN_PASS_RATE', 0.95),
  predictionBacktestMinGraded: () =>
    envInt('PREDICTION_BACKTEST_MIN_GRADED', 10),
  afCostDailyMax: () => {
    const raw = process.env.AF_COST_DAILY_MAX;
    if (raw == null || raw === '') return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  },
};
