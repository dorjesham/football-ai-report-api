# 世界杯 2026 AF 运维手册

> 完整方案见 [world-cup-af-cutover-v1.1.md](./world-cup-af-cutover-v1.1.md)  
> 全站中文展示层（英文入库 + 中文 displayName）见 [localization-zh-CN-v1.md](./localization-zh-CN-v1.md)、入库挂钩 [localization-ingest-integration.md](./localization-ingest-integration.md)

## 环境

| 变量 | 建议 |
|------|------|
| `PREDICTION_PROVIDER` | `af` |
| `ENABLE_AF_RAW_BUNDLE` | `true`（默认） |
| `ENABLE_AF_FACTS_DUAL_WRITE` | 生产显式 `true`（裁判/Facts coverage） |
| `ENABLE_WC_CRON` | 生产按需 `true`（五档定时，注意配额） |

## 首跑

1. `npx prisma migrate deploy`
2. 运维后台 → 世界杯 2026 → 入库 → 一键 Bootstrap
3. 任务中心查看 `worldcup_af_full_bootstrap` 13 步
4. 场次页抽检 Coverage；绿/黄/红 + `gates.reasons`

## 发布 AI 门禁（PRE_MATCH）

服务端 `WC_AI_PUBLISH_GATE_FAILED` 返回 `reasons[]`。常见：

- `missing_af_predictions` / `missing_match_prediction`
- `home_snapshot_ratings_incomplete`（无 AF 攻防，非默认 50）
- `missing_weather`（有 city 且在 T-24 窗口）
- `ai_report_stale`（需 reconcile 后重发）

强制发布（审计）：`POST /admin/api/ai/reports/:id/publish` body `{ "forcedPublish": true, "reason": "..." }`。

## Cron 五档（`ENABLE_WC_CRON=true`）

| Job | 说明 |
|-----|------|
| wc-pre-match-t48 | T-48h 快照 |
| wc-pre-match-t24 | sync-full + 天气 + 预测 |
| wc-pre-match-t1 | 预测刷新 + stale 标记 |
| wc-live-tick | LIVE 单场同步 |
| wc-post-match | 积分榜/射手榜 + 完赛补数 |

## 配额

Bootstrap 与 Cron 会大量调用 API-Football；关注驾驶舱 AF 配额与 `ENABLE_WC_CRON` 开关。

## 中文本地化（方案文档）

球队中文覆盖当前走 `AfTeamNameOverride`（后台「球队中文名」）；全站 `EntityTranslation` + Bootstrap `zh_seed_apply` 等为 **v1 拟议**，见 [localization-zh-CN-v1.md](./localization-zh-CN-v1.md) 与 [localization-ingest-integration.md](./localization-ingest-integration.md)。
