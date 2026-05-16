# CI 验收脚本退出码

与 `scripts/ci-strict.util.ts`、`scripts/ci-run-l1-suite.ts` 一致。

| 退出码 | 含义 | nightly（`CI_STRICT=1`） | release（`CI_RELEASE=1`） |
|--------|------|--------------------------|---------------------------|
| **0** | 通过或仅非 strict 告警 | 通过 | 通过 |
| **1** | 阈值未达标或逻辑错误 | **失败** | **失败** |
| **2** | 无样本 / 无数据 | **warning**（job 仍可通过） | **失败** |

## 环境变量（阈值）

| 变量 | 默认 | 脚本 |
|------|------|------|
| `CI_STRICT` | — | `1` 启用阈值失败 |
| `CI_RELEASE` | — | `1` 时 exit 2 也视为失败 |
| `LIVE_SYNC_P95_MAX_MS` | `60000` | `live-sync:latency-report` |
| `REPORT_FACT_CHECK_MIN_PASS_RATE` | `0.95` | `report:fact-check-sample` |
| `PREDICTION_BACKTEST_MIN_GRADED` | `10` | `prediction:backtest` |
| `AF_COST_DAILY_MAX` | 未设则不 fail | `ops:af-cost-report` |
