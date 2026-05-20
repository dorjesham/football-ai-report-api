# API-Football v2 验证报告

**日期**：2026-05-22（代码收尾后更新）  
**验收场**：`cmpbfd6f901lap201oypcx4se`（AF fixture `1379333`）  
**对照文档**：[后端开发架构指南最终版.md](../后端开发架构指南最终版.md)  
**部署 Runbook**：[deploy-v2-sealos.md](./deploy-v2-sealos.md)

---

## 1. 现网（生产）结论

**复测日期**：2026-05-22

| 检查项 | URL | 结果 |
|--------|-----|------|
| 健康检查 | `GET /health` | **200** |
| detail-v2 | `GET /matches/cmpbfd6f901lap201oypcx4se/detail-v2` | **200** |
| api-v2 detail | `GET /api/v2/matches/:id/detail` | 与 detail-v2 同 schema（验收脚本比对） |
| api-v2 access | `GET /api/v2/matches/:id/access` | 仅 access/paywall |
| metrics | `GET /metrics` | Prometheus 文本 |
| sync-full | `POST /admin/api/af/matches/:id/sync-full` | **201**（验收脚本内） |
| acceptance 脚本 | `scripts/acceptance-pre-match-unlocked.sh` | **通过** |

验收输出摘要：injuries 13/13 含 type；Admin 解锁后 predictions `locked=false` `hasData=true`；游客 `predictions.locked=true` `data=null`。

> 若新环境首次部署，仍须 `prisma migrate deploy`（含 `20260522120000_ai_report_input_hash`），见 [deploy-v2-sealos.md](./deploy-v2-sealos.md)。

---

## 2. 本地 / CI 结论

| 检查项 | 状态 |
|--------|------|
| `npm run build` | 通过（含 Prisma `AiReport.inputHash` 等字段） |
| `npm run test:ci` | 单元/契约测试（含 `match-intel-af-bundle`、`ai-report-input-hash`） |
| detail-v2 契约 | `schema: match-detail-v2`，分 tier 缓存 |
| 遗留下线 | intel 固定无 OLS/markets；`powerRating` 榜单 410 |
| P4 | `AiReport.inputHash` / `promptVersion` / bundle 驱动 prompt |
| 数据层 | B2/B4/B5 migration；`syncLeagueCatalog` 全 B2；B5 `MatchOddsLiveSnapshot` |
| 管线 | 已移除 `af_match_facts`、`prediction` 步骤 |
| BFF odds | `prematchSnapshots` + `liveSnapshots`（解锁可见） |

---

## 3. 架构指南完成度（摘要）

| 阶段 | 状态 |
|------|------|
| P0 injuries / 关 OLS·markets | **完成**（C 端硬编码关闭，非仅 env） |
| P1 MatchAfRawBundle + sync-full | **完成** |
| P2 Orchestrator + Cron + coverage 窗 | **完成**（含 `league-af-catalog` cron） |
| P3 detail-v2 + Paywall | **完成**（paywall 含 benefits/buttonText） |
| P4 pipeline + inputHash | **完成** |
| P5 前端切 v2 | **未做**（见 [Web比赛详情对接说明.md](../Web比赛详情对接说明.md) §1.1） |
| P6 deprecated + 文档 | **完成**（OLS/markets 源码保留但默认停写停展示） |

---

## 4. 后台管理系统

| 层级 | 状态 |
|------|------|
| Admin API `/admin/api/af/...` | sync-full / coverage / window / B2 `leagues/catalog` / B4 teams·players / `matches/:id/enrichment` |
| admin-web | 比赛页 B4 按钮；**Catalog 三页**（联赛 B2 / 球队 / 球员）；coverage 弹窗 **B4/B5 Tab**；Dashboard guideV2 + `/metrics` |
| Migrations | `20260519140000_match_af_raw_bundle`、`20260522120000_ai_report_input_hash` |

---

## 5. 验收签字清单

- [x] 生产 `detail-v2` + `sync-full` 可用（200/201）
- [x] `acceptance-pre-match-unlocked.sh` 生产通过
- [x] 代码：intel/pre-match/analysis-preview `deprecated`
- [x] 代码：intel `predictionMarkets` 恒 null（v2 路径）
- [ ] 生产 env 确认 `ENABLE_OLS=false`（需在 Sealos 面板核对）
- [x] Admin `GET af/coverage/window` 含 `predictionsPresentRatio`
- [ ] 生产 Admin 生成报告后 DB 可查 `AiReport.inputHash`（需 migrate 后点一次生成）
