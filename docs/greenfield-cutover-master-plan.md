#新库切流完整方案（终章对齐 + 生产保护栏）

> **版本**：2026-06  
> **状态**：执行主文档（合并原《新库 + 新 Admin + 新灌数》与《生产保护栏补充》）  
> **前提**：已上线、**零真实用户**；可弃用旧库、不迁移订单/用户业务数据  
> **数据库**：继续 **MySQL 8**（新实例/新库名），不切换 PostgreSQL  
> **关联**：[后端开发架构指南最终版.md](后端开发架构指南最终版.md)、[docs/deploy-v2-sealos.md](docs/deploy-v2-sealos.md)、[Web前端对接文档-完整版.md](Web前端对接文档-完整版.md)、[小程序前端对接文档-完整版.md](小程序前端对接文档-完整版.md)

---

## 文档目录

1. [目标与原则](#一目标与原则)  
2. [目标架构](#二目标架构)  
3. [数据真理与存储模型](#三数据真理与存储模型)  
4. [幂等与唯一约束](#四幂等与唯一约束)  
5. [任务中心落库模型](#五任务中心落库模型)  
6. [AI 生成与发布规则](#六ai-生成与发布规则)  
7. [C 端 Detail API](#七c-端-detail-api)  
8. [AF 失败、限流与重试](#八af-失败限流与重试)  
9. [旧管线与旧 API 退役](#九旧管线与旧-api-退役)  
10. [新 Admin 设计](#十新-admin-设计)  
11. [新库创建与 migration SOP](#十一新库创建与-migration-sop)  
12. [旧库归档](#十二旧库归档)  
13. [新灌数剧本 A–F](#十三新灌数剧本-af)  
14. [环境变量](#十四环境变量)  
15. [代码差距与 Go/No-Go](#十五代码差距与-gono-go)  
16. [验收签字表](#十六验收签字表)  
17. [一期 / 二期边界](#十七一期--二期边界)  
18. [时间线与分工](#十八时间线与分工)  
19. [回滚策略](#十九回滚策略)

---

## 一、目标与原则

### 1.1 要达成什么

| 目标 | 说明 |
|------|------|
| **新 MySQL 库** | 空库 + 34 条 migration 一次 deploy 成功 |
| **单一数据链路** | AF → `MatchAfRawBundle`；AI → `AiReport`；C 端 → `/api/v2/matches/:id/detail` |
| **新 Admin** | 小白可运维：向导、单场仪表盘、任务明细、AI 全文预览与发布 |
| **旧库弃用** | 全量备份后只读归档，不再 migrate / 灌数 / 写入 |
| **旧管线硬退役** | 后端 410，bootstrap 无 intel-full，Admin 无旧按钮 |

### 1.2 核心原则

```text
外部事实真理：MatchAfRawBundle（AF Raw，可回放）
AI 内容真理：    AiReport（仅 PUBLISHED 对 C 端可见）
业务索引：      Match（列表、状态、Cron、Admin 入口）
展示契约：      match-detail-v2 schema（稳定，局部缺失不 500）

Admin 只驱动 ingest，不直接改库
ingest 必须幂等，可重复执行
任务必须落库，失败可追溯、可部分成功
```

### 1.3 不做什么（一期）

- 不重画整张 ER、不迁 PostgreSQL  
- 不做多数据源 `SourceEntityMapping`  
- 不做 `MatchManualOverride`  
- 不强上 MySQL `MatchDetailViewCache`（用 Redis tier 缓存）  
- 不为历史 bundle 版本一期上复杂 schema  

---

## 二、目标架构

```mermaid
flowchart TB
  subgraph admin [新 Admin]
    W[入库向导]
    P[比赛中心 / ops-status]
    J[任务中心 + 每场明细]
    A[AI 与发布]
    O[总览 / 覆盖率]
  end

  subgraph job [任务与观测]
    JR[IngestJobRun 等同 IngestJob]
    JI[IngestJobItem 一期增强或二期表]
    AFLOG[AfSyncLog]
  end

  subgraph ingest [灌数 - 仅新剧本]
    B1[full_initial]
    B2[sync-full / AF Cron]
    B3[scheduled_pre_match_bootstrap]
    B4[finished_post_match_bootstrap]
    B5[live_bootstrap + live_match_enrich]
    B6[catalog B2/B4 + B5 odds cron]
  end

  subgraph store [MySQL 新库]
    M[Match]
    RAW[MatchAfRawBundle]
    AI[AiReport]
    L2[LeagueAfCache]
    B4T[AfTransferRaw / Trophies / Sidelined]
    B5O[MatchOddsLiveSnapshot]
  end

  subgraph serving [C 端服务层]
    BFF[match-detail-bff]
    REDIS[Redis detail-v2 分 tier]
    V2[GET /api/v2/matches/:id/detail]
  end

  admin --> ingest
  admin --> job
  ingest --> job
  ingest --> store
  store --> BFF
  AI --> BFF
  BFF --> REDIS
  REDIS --> V2
```

---

## 三、数据真理与存储模型

### 3.1 表职责（一期必须）

| 表/模块 | 角色 | C 端 |
|---------|------|------|
| `Match` | 比赛主索引、状态、开球、比分、`externalId` | `basic` |
| `MatchAfRawBundle` | AF 整包 JSON，1:1 `matchId` | `freeModules` / `paidModules` 数据源 |
| `AiReport` | DeepSeek 报告，带 `status` / `inputHash` | 仅 **PUBLISHED** |
| `LeagueAfCache` | 联赛 B2 物化 | `/api/v2/leagues/:code/*` |
| B4 catalog 表 | 球队/球员档案 | `/api/v2/teams|players/*` |
| `MatchOddsSnapshot` | 赛前 T24/T1 | odds 子结构 |
| `MatchOddsLiveSnapshot` | 赛中赔率流/最新 | `liveSnapshots` |
| `IngestJobRun` | 批量任务审计 | Admin 任务中心 |
| `AfSyncLog` | AF 单次 HTTP 审计 | Admin 同步日志 |

### 3.2 Bundle 策略（MVP）

**每场一份最新 Raw**：

```text
UNIQUE(matchId) on MatchAfRawBundle
sync-full => upsert by matchId，覆盖 JSON，更新 syncedAt / availability
```

不做一期历史多版本；二期若要强回放再考虑 `bundleType` 或 `inputHash` 版本链。

---

## 四、幂等与唯一约束

所有以下操作**必须可重复执行**且不产生不可控重复数据：

```text
full_initial / scheduled_pre_match_bootstrap / finished_post_match_bootstrap
live_bootstrap / live_match_enrich
POST /admin/api/af/matches/:id/sync-full
POST /admin/api/af/sync-pre-match|live|finished
AI generate / AI publish / detail 缓存刷新
npx prisma db seed
```

### 4.1 建议唯一约束（与现 schema 对齐）

| 实体 | 约束 | 现网 |
|------|------|------|
| `Match` | `UNIQUE(externalId)`（`af-f-*`） | ✅ 已有 |
| `MatchAfRawBundle` | `UNIQUE(matchId)` | ✅ 已有 |
| `MatchOddsSnapshot` | `UNIQUE(matchId, phase, provider)` | ✅ 已有 |
| `LeagueAfCache` | `UNIQUE(competitionCode, season)` | ✅ 已有 |
| `AiReport` | `UNIQUE(matchId, reportType, inputHash)` | ⚠️ 建议加 migration |
| 同场同类型仅一个 PUBLISHED | `publishedKey` 唯一 或 事务归档 | ⚠️ 待实现 |
| `MatchOddsLiveSnapshot` | 定策略：最新 `UNIQUE(matchId, companyId, marketType)` 或时间序列 | ⚠️ 待明确 |

### 4.2 Team / Player / League

- 一期：继续 `externalId` 唯一（`af-t-*` / `af-p-*`）+ seed/catalog upsert  
- 二期：可加 `source + externalId` 为多数据源预留  

### 4.3 Seed 幂等

- 管理员、`Tournament` / `Competition` / `Season`：**upsert**  
- 重复 `prisma db seed` 不得异常增殖核心目录行  

---

## 五、任务中心落库模型

### 5.1 一期映射（复用现有表）

| 补充文档概念 | 现仓库实现 | 一期动作 |
|--------------|------------|----------|
| `IngestJob` | **`IngestJobRun`** | 沿用；状态增加 `PARTIAL_SUCCESS` 语义 |
| `IngestJobItem` | **`resultSummary` JSON 内 errors[]** | 切库前：结构化写入每场 matchId+error；切库后 2 周：可选独立表 |
| `IngestJobStepLog` | **`AfSyncLog`** + job `stepLabel` | AF 级日志已有；关键步骤写入 summary |

### 5.2 任务状态

**Job（IngestJobRun）**：

```text
PENDING → RUNNING → SUCCESS | PARTIAL_SUCCESS | FAILED | CANCELED
```

**Item（每场）**：

```text
PENDING → RUNNING → SUCCESS | SKIPPED | FAILED | RETRYING
```

**规则**：

- 100 场中 8 场失败 → Job = `PARTIAL_SUCCESS`，8 条 Item = `FAILED`  
- 禁止「整场失败但无每场明细」  

### 5.3 并发去重

```text
同一 jobType + 相同 scope 已 RUNNING → 返回现有 jobId，不新开任务
同一 matchId 的 sync-full RUNNING → 返回当前任务，不并行写 bundle
```

---

## 六、AI 生成与发布规则

### 6.1 状态（映射现 enum）

| 业务含义 | 使用 `ReportStatus` |
|----------|---------------------|
| 草稿/生成中 | `DRAFT`（可选扩展 `REVIEW`） |
| 可发布 | `REVIEW` 或 `DRAFT` + 校验通过 |
| 已发布 | `PUBLISHED` |
| 历史 | `ARCHIVED` |
| 生成失败 | 保持 `DRAFT` + `contentWarnings` 或 metadata 标 failed |

不必一期新增 `GENERATING`/`READY` enum，除非 Admin 要强展示进度条。

### 6.2 C 端读取（硬规则）

```text
C 端 / detail-v2 只读取 status = PUBLISHED 的 AiReport
不得返回 DRAFT / REVIEW 的 freeSummary 或 rawOutput
无 PUBLISHED → paidModules.aiReports 为 empty/missing，不 500
```

**切库前必须改代码**：当前 BFF 对 `aiReports` 仅筛 `reportType`，需加 `status: PUBLISHED`。

### 6.3 重新生成

```text
相同 matchId + reportType + inputHash 已有 PUBLISHED/READY → 默认跳过
Admin「强制重生成」→ 新记录 + 新 inputHash 或 force 标记
不直接覆盖旧 PUBLISHED 行
```

### 6.4 发布（事务）

```text
1. 校验内容非空 + content-safety
2. 事务开始
3. 同 matchId + reportType 的旧 PUBLISHED → ARCHIVED（publishedKey 置空）
4. 目标报告 → PUBLISHED，写 publishedAt
5. 提交
6. invalidateAfterMatchDataChange(matchId)
```

### 6.5 与 bootstrap 的关系

`finished_post_match_bootstrap` 步骤：

```text
generatePostMatch → DRAFT
publishPostMatch → PUBLISHED
```

依赖 **`AiReport.inputHash` 等列已 migrate**，否则在 `findFirst` 即失败。

---

## 七、C 端 Detail API

### 7.1 主路径

```http
GET /api/v2/matches/:matchId/detail
GET /api/v2/matches/:matchId/access   # 首屏轻量
POST /api/v2/matches/:matchId/unlock  # JWT + 绑手机
```

Legacy（仅兼容，运维不依赖）：`GET /matches/:id/detail-v2`（Deprecation 头）

### 7.2 一期：实时拼装 + Redis 缓存

```text
Match + MatchAfRawBundle + AiReport(PUBLISHED) + odds 表 + Paywall
→ 组装 match-detail-v2
→ 缓存 Redis key: match-detail-v2:{matchId}:{tier}
   tier = guest | free | unlocked | admin（禁止 unlocked 与 guest 共用）
```

**要求**：

- 局部缺失（injuries/odds/predictions empty）→ **200** + `empty`/`locked`/`missing`，**不 500**  
- 游客：`paidModules.*.locked=true` 且 `data=null`  

### 7.3 二期（有流量后再做）

- 表 `MatchDetailViewCache`：缓存**公共 payload**，运行时按 entitlement 挂 paidModules  
- 不做 guest/locked/unlocked/admin 四套完整 JSON 缓存  

---

## 八、AF 失败、限流与重试

### 8.1 统一行为

| 情况 | 行为 |
|------|------|
| 401 / 403 | 停止任务，`credential_error`，不重试 |
| 429 | 指数退避（已有 `getWith429Retry`），标记 `rate_limited` |
| 5xx / 超时 | 最多 3 次退避 |
| 单端点无数据 | 不视为整场失败；coverage = `missing`/`empty` |
| fixture 拉取失败 | **整场失败** |
| 配额耗尽 | 停止批量，保留已完成场 |

### 8.2 sync-full 端点优先级

```text
fixture 失败 → 整场失败
predictions / injuries / odds / lineups 缺失 → 写 bundle + coverage 标黄/红，不阻塞 Match 入库
未开赛缺 events/statistics → 正常 empty
```

### 8.3 coverage 状态（Admin 展示）

```text
ok | empty | missing | error | not_applicable
```

---

## 九、旧管线与旧 API 退役

### 9.1 必须 410 的后端路由（示例）

```http
POST /admin/api/matches/:matchId/pipeline/intel-full
POST /admin/api/matches/:matchId/predictions/sync   # 若 bundle 已含 predictions
POST /admin/api/matches/:matchId/tactics/generate   # 若产品不保留
```

响应：

```json
{
  "success": false,
  "errorCode": "LEGACY_PIPELINE_RETIRED",
  "message": "Use POST /admin/api/af/matches/:matchId/sync-full instead."
}
```

HTTP **410 Gone**（或 403）。

### 9.2 Bootstrap 内禁止

`scheduled_pre_match_bootstrap` / `finished_post_match_bootstrap` / `full_initial` 内不得调用：

```text
intel-full、OLS、legacy prediction、predictionMarkets、旧 tactics
```

相关 env 默认 **false** 且代码路径不可达。

### 9.3 Admin 前端

- 删除「展开旧管线」及 Import 中 intel-full 文案  
- 仅保留新剧本按钮（见 §十、§十三）

### 9.4 旧库 policy

```text
旧库：只读备份备查
禁止：migrate deploy、seed、bootstrap、任何写入、承载生产流量
回滚应用版本可以，回滚旧库写入不可以
```

---

## 十、新 Admin 设计

### 10.1 信息架构（5 个一级菜单）

| 菜单 | 功能 |
|------|------|
| **总览** | 健康、AF 配额、未来 10 天覆盖率、guideV2、一键任务入口 |
| **入库向导** | 分步执行 `full_initial` 等，进度条 + 人话说明 |
| **比赛中心** | 搜索/筛选；单场仪表盘 |
| **任务中心** | Job 列表；每场明细；跳转比赛中心 |
| **AI 与发布** | 报告列表；全文预览；发布/归档 |

侧栏保留：**联赛 B2**、**球队 B4**、**球员 B4**（已实现路由可保留）。

### 10.2 聚合接口（一期强烈建议）

```http
GET /admin/api/matches/:matchId/ops-status
```

返回：比赛基础信息、`rawBundle.coverage`、`ai.preMatch/postMatch` 状态、最近 job、lastError、detail 探测结果（guest/locked 摘要）。

一期可不建 `MatchOpsStatus` 表；二期列表页变慢再加物化表。

### 10.3 单场「执行推荐流程」

| 比赛状态 | 步骤 |
|----------|------|
| **SCHEDULED** | sync-full →（可选）生成 PRE_MATCH AI →（可选）发布 → 刷缓存 |
| **LIVE** | sync live → B5/enrich → 修正假 LIVE → 刷缓存 |
| **FINISHED** | sync-full → facts → grading（若要）→ generatePostMatch → publish → 刷缓存 |

失败策略见原补充 §5 表格（AI 失败不撤销 bundle；publish 失败不暴露草稿）。

### 10.4 AI 与发布页

- 展示：`freeSummary` 全文、`structuredContentJson`、`inputHash`、`promptVersion`、`rawOutput`（折叠）  
- 操作：发布、强制重生成、归档  
- 与任务中心联动：bootstrap 失败一键跳转该场  

---

## 十一、新库创建与 migration SOP

### 11.1 新库规格

- MySQL **8.0+**，`utf8mb4_unicode_ci`  
- 库名建议：`football_ai_v2`  
- 磁盘 ≥ 20GB（JSON bundle 会涨）

### 11.2 初始化（维护窗口内，API 未切流前）

```bash
export DATABASE_URL='mysql://USER:PASS@HOST:3306/football_ai_v2?connection_limit=15'

cd football-ai-report-api
npm ci
npx prisma migrate status    # 应为空库或待应用
npx prisma migrate deploy    # 34/34 Applied，无 P3009
npx prisma db seed           # 目录 + 管理员
```

验证：

```sql
SHOW COLUMNS FROM AiReport LIKE 'inputHash';
SELECT COUNT(*) FROM Tournament;
```

### 11.3 发版顺序（强制）

```text
1. 确认 DATABASE_URL → 新库
2. prisma migrate deploy（entrypoint 不跑 migrate）
3. 确认 schema up to date
4. 发布 API 镜像
5. npm run build:admin && 发布 admin 静态资源
6. 冒烟（§十六）
7. 执行灌数 A–F（§十三）
```

**禁止**：先发布 API 再 migrate；禁止对旧库 deploy。

### 11.4 本地危险脚本

```bash
CONFIRM_DB_NUKE=yes npm run db:nuke-rebuild
```

仅允许本地/一次性测试库；生产禁用或加 `DATABASE_URL` 域名白名单校验。

### 11.5 切库前代码门禁

```bash
npm run build
npm run test:ci
# 空库 migrate deploy 在 CI 或本地 Docker MySQL 跑通
```

---

## 十二、旧库归档

| 步骤 | 操作 |
|------|------|
| 1 | `mysqldump` 或云快照 → `football_ai_backup_YYYYMMDD.sql` |
| 2 | 存对象存储，保留 ≥30 天 |
| 3 | 记录旧 `DATABASE_URL` 为 `DEPRECATED` |
| 4 | 切换所有服务 `DATABASE_URL` 至新库 |
| 5 | 旧库账号只读或断权 |

---

## 十三、新灌数剧本 A–F

**试点**：`AF_SYNC_LEAGUES=39,140,135,78,61,2,3`，`AF_SYNC_SEASON=2025`。

| 阶段 | Admin / 操作 | Bundle / API | 成功标志 |
|------|----------------|--------------|----------|
| **A 地基** | 入库向导 → 一键初始入库 | `full_initial` | Job 100%；有赛程 `af-f-*` |
| **A'** | 可选世界杯赛程 | `fixtures_worldcup` | WC matches 存在 |
| **B 未开赛** | 补全近10天未开赛 | `scheduled_pre_match_bootstrap`（无 intel-full） | SCHEDULED 场 bundle coverage 达标 |
| **B'** | 单场补洞 | `POST .../af/matches/:id/sync-full` | coverage 绿/黄可解释 |
| **C 档案** | 联赛 B2 / 球队·球员 B4 sync | catalog API | `/api/v2/leagues/PL/standings` 200 |
| **D 已结束** | 补全已结束比赛详情 | `finished_post_match_bootstrap` | POST_MATCH PUBLISHED；无 inputHash 列错误 |
| **E 赛中** | 刷新比分 / 同步赛中 / B5 cron | `live_bootstrap`、`live_match_enrich` | LIVE 比分与 liveSnapshots 更新 |
| **F 验收** | 脚本 + 人工 | `acceptance-pre-match-unlocked.sh` | 全绿 + §十六 |

**验收场**：灌数后从 `GET /matches?status=SCHEDULED` 取真实 `matchId` 更新 `ACCEPTANCE_MATCH_ID`（文档示例 `cmpbfd6f901lap201oypcx4se` 仅作格式参考）。

**C 端抽查**：

```bash
curl -sS "$API/api/v2/matches/$MATCH_ID/detail" | jq '{schema,isUnlocked,predLocked:.paidModules.predictions.locked}'
```

---

## 十四、环境变量

与 [docs/deploy-v2-sealos.md](docs/deploy-v2-sealos.md) 一致，生产必查：

| 变量 | 值 |
|------|-----|
| `ENABLE_AF_RAW_BUNDLE` | `true` |
| `ENABLE_AF_SYNC_CRON` | `true` |
| `ENABLE_OLS` | `false` |
| `ENABLE_PREDICTION_MARKETS` | `false` |
| `ENABLE_PIPELINE_LEGACY_PREDICTION` | `false` |
| `ENABLE_AF_FACTS_DUAL_WRITE` | `false` |
| `FINISHED_FREE_ALL` | `true` |
| `FOOTBALL_FEED_PUBLIC` | `false` |
| `ENABLE_AF_CATALOG_SYNC` | `true`（可选） |
| `ENABLE_AF_ODDS_LIVE_SYNC` | `true` |
| `DEEPSEEK_API_KEY` | 已配置 |
| API Football Key | 已配置 |

`.env` 细则按现有部署文档，本方案不重复。

---

## 十五、代码差距与 Go/No-Go

### 15.1 切库前必须完成（No-Go 若未满足）

| # | 项 | 现状 | 要求 |
|---|-----|------|------|
| 1 | MySQL migration 全绿 | `20260522120000` 等可能失败 | 修正 SQL + 空库 deploy |
| 2 | C 端只读 PUBLISHED AI | BFF 未筛 status | 加 `PUBLISHED` 条件 |
| 3 | 旧 Admin API 410 | intel-full 仍存在 | 410 + 消息体 |
| 4 | scheduled bootstrap | 可能含 intel 步 | 改为 sync-full 链 |
| 5 | 发布唯一性 | 无 publishedKey | 事务归档旧 PUBLISHED |
| 6 | 任务每场错误 | 仅 summary JSON | 结构化 errors[] 或 JobItem 表 |
| 7 | `ops-status` API | 无 | 实现聚合接口 |
| 8 | Admin UI | 有旧管线折叠 | 新菜单 + 去旧按钮 |

### 15.2 切库后 2 周内

- `IngestJobItem` 表 + 仅重跑失败场  
- `MatchOddsLiveSnapshot` 唯一策略  
- `UNIQUE(matchId, reportType, inputHash)` on AiReport  
- 数据对比页（Raw JSON vs detail 预览）  
- `MatchOpsStatus` 物化（若列表慢）  

---

## 十六、验收签字表

### 16.1 基础设施

- [ ] 新库 `migrate deploy` 全绿，`AiReport.inputHash` 存在  
- [ ] 旧库已备份且不再写入  
- [ ] API / Admin 指向新库  
- [ ] env 符合 §十四  

### 16.2 幂等（§12.1）

- [ ] `full_initial` ×2、`sync-full` ×2、`seed` ×2 无重复 Match/Team/异常增殖 bundle  
- [ ] 同场仅一个 active PUBLISHED（每 reportType）  

### 16.3 任务中心（§12.2）

- [ ] Job 有进度、步骤 label、`PARTIAL_SUCCESS` 可出现  
- [ ] 失败场有 matchId + errorMessage，可跳转比赛中心  

### 16.4 AI 发布（§12.3）

- [ ] 未发布时 C 端无 AI 正文  
- [ ] 发布后 C 端可见；再生成未发布前仍见旧版；发布后旧版 ARCHIVED  

### 16.5 旧 API（§12.4）

- [ ] intel-full 等返回 410，不写库  
- [ ] Admin 无旧入口  

### 16.6 Detail（§12.6）

- [ ] 数据不全场仍 200；游客 `paidModules.data=null`  
- [ ] `acceptance-pre-match-unlocked.sh` 通过  

### 16.7 业务抽验

- [ ] ≥3 场 SCHEDULED v2 detail 正常  
- [ ] ≥3 场 FINISHED 有 POST_MATCH 或明确 empty 原因  
- [ ] B2 积分榜 API 200  

---

## 十七、一期 / 二期边界

### 一期（切库上线）

幂等约束、任务落库与每场明细、AI 发布规则、C 端 PUBLISHED、Detail 实时拼装+Redis、AF 失败策略、410 退役、seed/migration SOP、新 Admin MVP、A–F 灌数、§十六 验收。

### 一期可轻量

`ops-status` 实时聚合；`resultSummary` 代替 Item 表；无 DB Detail cache；无 ManualOverride；无三栏 diff 页。

### 二期

`IngestJobItem`/`StepLog` 完善、仅重跑失败场、`MatchDetailViewCache`、`MatchOpsStatus` 表、B5 历史走势、`publishedKey`/`inputHash` 唯一索引强化、多数据源 mapping、完整 AI 审核流。

---

## 十八、时间线与分工

| 周 | 后端 | admin-web | 运维 |
|----|------|-----------|------|
| W1 | migration 修复；410；bootstrap 改造；BFF PUBLISHED；发布事务；ops-status API | 新菜单骨架；去旧按钮 | 申请新 MySQL |
| W2 | Job 每场 errors；AF 策略文档化进代码注释/测试 | 向导、仪表盘、AI 页、任务明细 | **窗口**：备份旧库→新库 deploy→发版→A–F |
| W3 | 修验收项；二期 Issue  backlog | 打磨文案与空态 | 签字 §十六 |

| 角色 | 职责 |
|------|------|
| 后端 | §十五 Go 项、ingest、bootstrap、BFF、Admin API |
| 前端 | §十 Admin |
| 运维/你 | §十一–十三、env、备份、灌数执行 |
| 产品 | 确认是否保留战术长文/沙盘（否则 410） |

---

## 十九、回滚策略

| 情况 | 动作 |
|------|------|
| 新库灌数失败 | Drop/truncate 新库业务表，修脚本后重跑 A–F（无用户） |
| 应用 bug | 回滚上一镜像；**不要**把写入切回旧库 |
| 短期 C 端 | 不建议关 `ENABLE_AF_RAW_BUNDLE`；优先修数据与 migrate |

---

## 二十、交付物清单

| 文档/产物 | 说明 |
|-----------|------|
| 本文 | 执行主方案 |
| `docs/deploy-v2-sealos.md` | 部署与环境（保持同步） |
| Web/小程序完整版对接文档 | C 端契约 |
| `scripts/acceptance-pre-match-unlocked.sh` | 自动化验收 |
| （建议）`docs/greenfield-cutover-checklist.md` | §十六 勾选打印版 |

---

## 二十一、总结

本方案在**不推翻**「新库 + 新 Admin + 新灌数 + 指南终章」的前提下，合并了**生产保护栏**：幂等、任务落库、AI 仅发布可见、Detail 稳定降级、AF 失败策略、旧 API 410、migration/seed SOP、加强验收。

**零用户**使你们可以采用**最干净路径**：新 MySQL 实例、硬退役旧管线、不必灰度双写。  
**切库成败**取决于 §十五 前 8 项 Go/No-Go，而不是再建一套数据库。

---

