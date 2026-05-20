# v2 Sealos 生产部署 Runbook

对照 [后端开发架构指南最终版.md](../后端开发架构指南最终版.md)、[verification-v2-report.md](./verification-v2-report.md)、[greenfield-cutover-master-plan.md](./greenfield-cutover-master-plan.md)。

## 0. 新库切流（Greenfield）

**旧库若曾 failed migration（如 P3009）**：归档只读，**不要** `prisma migrate resolve`；新建空库后切 `DATABASE_URL`。

```bash
# 新库（维护窗口）
export DATABASE_URL='mysql://user:pass@host:3306/football_ai_v2'
npx prisma migrate deploy
npx prisma db seed
npm run build && npm run build:admin
# 发版顺序：migrate → seed → API → admin 静态资源
```

发版后旧 Admin 管线路由（`intel-full`、战术/长文等）返回 **410**；运维使用 **入库向导** + **sync-full** + **ops-status**。可打印勾选：[greenfield-cutover-checklist.md](./greenfield-cutover-checklist.md)。

## 1. 环境变量（生产必查）

| 变量 | 推荐值 | 说明 |
|------|--------|------|
| `ENABLE_AF_RAW_BUNDLE` | `true`（默认） | detail-v2 读 MatchAfRawBundle |
| `ENABLE_AF_SYNC_CRON` | `true` | 近窗 SCHEDULED bundle 同步 |
| `ENABLE_OLS` | `false` | 下线 OLS 战力展示 |
| `ENABLE_PREDICTION_MARKETS` | `false` | 下线自建 markets |
| `ENABLE_PIPELINE_LEGACY_PREDICTION` | `false` | intel 管线不写 MatchPrediction |
| `ENABLE_AF_FACTS_DUAL_WRITE` | `false` | 停 MatchFacts 双写（v2 收尾后） |
| `FINISHED_FREE_ALL` | `true` | 完赛登录用户全量权限 |
| `FOOTBALL_FEED_PUBLIC` | `false` | C 端禁止直连 AF |
| `AF_SYNC_LEAGUES` | `39,140,135,78,61,2,3` | 试点联赛 |
| `AF_SYNC_SEASON` | `2025` | 当前赛季年 |
| `ENABLE_AF_CATALOG_SYNC` | `true`（可选） | B4 低优先级 cron |
| `ENABLE_AF_ODDS_LIVE_SYNC` | `true`（LIVE 场） | B5 写入 `MatchOddsLiveSnapshot` |
| `AF_ODDS_LIVE_LEAGUES` | 同 `AF_SYNC_LEAGUES` | 赛中赔率白名单 |
| `AF_ODDS_LIVE_INTERVAL_SEC` | `120` | cron 节流间隔 |

Migration：`20260622120000_guide_final_b2_b4_b5`（B2 列、B4/B5 表）。

## 2. 发布步骤

```bash
# 本地门禁
npm ci
npm run build
npm run test:ci
npx prisma migrate deploy   # 连生产/预发 DB 的环境执行

# 管理端静态资源（含 Catalog 三页、B4/B5 弹窗；改 admin-web 后必跑）
npm run build:admin

# 镜像（Sealos 构建或本地）
docker build -t football-api:v2 .
```

**注意**：[entrypoint.sh](../entrypoint.sh) 启动时**不**执行 migrate，须在发布前对生产库执行 `npx prisma migrate deploy`。

## 3. 发布后冒烟

```bash
API=https://oaifjhzmpswi.sealosbja.site
curl -sS "$API/health"
curl -sS "$API/api/v2/matches/cmpbfd6f901lap201oypcx4se/detail" | head -c 500
curl -sS "$API/metrics" | head -5
```

Admin（需 JWT）：

```bash
curl -sS -X POST "$API/admin/api/af/matches/cmpbfd6f901lap201oypcx4se/sync-full" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force":true}'
```

## 4. 验收脚本

```bash
export API_ORIGIN=https://oaifjhzmpswi.sealosbja.site
bash scripts/acceptance-pre-match-unlocked.sh
```

## 5. 回滚

1. Sealos 回滚上一镜像版本。
2. 应急：设 `ENABLE_AF_RAW_BUNDLE=false`（旧读路径，仅短期）。
3. 前端：关闭 `USE_DETAIL_V2`，回 `GET /matches/:id/intel`。
