# 世界杯 AF 唯一数据源重构方案 v1.1（整合完整版）

> **面向对象**：后端工程师、运维后台前端、QA  
> **背景**：项目暂无真实用户与历史生产包袱，本次采用**干净切换**，不做 `wc26-*` 兼容迁移。  
> **目标**：世界杯 2026 及全局预测链路统一为 **API-Football（AF）唯一数据源**；删除 ELO、旧 JSON 导入、`wc26-*` 双轨；建立可运维、可扩展、可审计的数据与 AI 链路。  
> **版本**：v1.1（整合原 v1 + 代码库对照修订）

---

## 文档修订说明（相对 v1）

| 修订项 | 说明 |
|--------|------|
| `ReportStatus.READY` | 改为 **`REVIEW`**（与 Prisma 枚举一致） |
| 赔率字段 | 统一为 **`oddsLatestJson`**（与 `MatchAfRawBundle` 一致） |
| `Match.city` | **已存在**，重点改为 fixture 同步时从 venue 回填 |
| `apiFootballTeamId` | P0 **可选**；主键关联继续用 `externalId = af-t-{id}` |
| 预测策略 | **方案 A（推荐）**：全局 `PREDICTION_PROVIDER=af`，禁止 model/ELO 回退 |
| Bootstrap AI | P0 **默认跳过**批量 LLM；由运维页按需触发 |
| Registry | 补充 coach、主客 teamStats、squads、dual-write |
| 攻防 50 | 必须改 **mapper + dossier**，不能仅靠 gate |
| 必填环境变量 | 增加 `ENABLE_AF_*`、`QWEATHER_*` 专节 |

---

# 1. 重构目标

## 1.1 总目标

建立干净的世界杯 2026（及全局 AF 预测）数据链路：

```text
AF 端点注册表（代码常量）
        ↓
世界杯专用 Bootstrap Job（IngestJobRun）
        ↓
Raw Bundle / Team / Player / Standing / Leaderboard / Facts
        ↓
MatchPrediction（AF only）/ TeamMatchSnapshot / Weather / Referee
        ↓
intelContentHash（比赛级） + inputHash（AI 版本级）
        ↓
Coverage（绿黄红） + AI Publish Gate
        ↓
AI DRAFT/REVIEW → 人工 PUBLISHED（stale 不自动覆盖）
        ↓
C 端比赛详情 / 小程序
```

## 1.2 本次允许直接删除

```text
删除 wc26-* 球队及旧 JSON 导入链路
删除 worldcup2026_teams.json 及相关脚本
删除 Team.eloRating 及一切 ELO 业务引用
删除世界杯 ELO / model fallback
删除 C 端与 API 对 eloRating 的返回
删除旧 POST admin/api-football/world-cup/import-bundle（或短期 410）
```

**不需要保留：**

```text
wc26-code → af-t-id 映射
UserTeamFollow 迁移（无用户可清库）
旧 import-bundle 逻辑转发
worldFootballElo 与 ELO 默认值 1500
```

测试库可直接清空世界杯相关表后重跑 Bootstrap。

## 1.3 预测策略（方案 A，推荐）

| 策略 | 说明 |
|------|------|
| **A（采用）** | 全局 `PREDICTION_PROVIDER=af`；AF 缺失则 **FAILED**，禁止 `generateFromModel` / ELO |
| B（备选） | 仅 `competition.code === 'WC'` 强制 AF；联赛保留 auto 回退 |

**本文按方案 A 编写。** 若二期联赛也要 model，再单独开配置；P0 不保留 ELO 路径。

---

# 2. 核心原则

| 原则 | 说明 |
|------|------|
| 世界杯只认 AF | 赛程、球队、球员、积分榜、预测、伤停、统计等均来自 AF |
| 全局预测只认 AF | `MatchPrediction` 不得再出现 `MODEL` / `ELO_FORM_FALLBACK` |
| 不保留 `wc26-*` | 球队 `externalId` 统一 `af-t-{apiTeamId}`，`dataSource = API_FOOTBALL` |
| 数据齐了才生成 AI | 经 **coverage + publish gate** 通过后才允许生成/发布 |
| 数据变了要识别 stale | 底层 hash 变化 → 已发布报告 `isStale=true`，不自动覆盖 |
| 缺失不造假 | 禁止静默填攻防 50、ELO 1500、假天气；标红 + `dataAvailability` |
| 运维独立入口 | 后台「世界杯 2026」顶级模块 |
| 批量任务进 Job | Bootstrap、reconcile、批量预测/AI 均写入 `IngestJobRun` |
| 范围限定删除 | 清理/查询必须带 `WC` / `FIFA_WC`，禁止全局 `af-*` 误删 |

---

# 3. 删除与废弃清单

## 3.1 删除文件（以仓库实际路径为准）

```text
worldcup2026_teams.json
prisma/import-wc2026-teams.ts
prisma/seed-wc2026-matches.ts
scripts/enrich_worldcup2026_teams.py
scripts/generate-wc2026-detail-overrides.mjs（若仅服务旧导入）
wc2026_team_detail_overrides.json（若仅服务旧导入）
```

## 3.2 删除或废弃接口

**旧接口：**

```http
POST /admin/api-football/world-cup/import-bundle
```

**处理（推荐）：** 直接删除；若短期有未知调用方，可返回 **410 Gone**：

```json
{
  "message": "已废弃，请使用 POST /admin/api/world-cup/bootstrap"
}
```

**新入口：**

```http
POST /admin/api/world-cup/bootstrap
```

## 3.3 ELO 全仓清理规则

搜索关键词：

```text
eloRating
worldFootballElo
homeElo / awayElo
ELO_FORM_FALLBACK
generateFromModel（ELO 路径）
wc26-
importWorldCup2026Teams
worldcup2026_teams
```

| 内容 | 处理 |
|------|------|
| `Team.eloRating` | Prisma migration **删列** |
| JSON `worldFootballElo` | 随文件删除 |
| `PredictionService.generateFromModel` | P0：**全局禁用**或删除 ELO 分支 |
| `competitions.service` 返回 `eloRating` | 删除字段 |
| C 端 / BFF 展示 ELO | 删除 |
| AI dossier / prompt / facts-envelope | 删除 ELO 字段与话术规则 |
| `powerRating`（OLS） | **列保留**；`ENABLE_OLS=false`；WC 与全局预测 **不得读取** |

**验收：** 业务代码无运行时 ELO 引用；文档/历史 migration 提及可接受。

## 3.4 数据库清理顺序（测试库）

按依赖从子到父（示例）：

```text
1. AiReport（WC 比赛）
2. MatchPrediction / MatchPredictionGrading
3. MatchAfRawBundle / MatchFacts / TeamMatchSnapshot / WeatherSnapshot / RefereeSnapshot
4. Match（competition=WC 或 tournament=FIFA_WC）
5. PlayerSeasonMetric / CompetitionStanding（WC）
6. Player（仅 WC 球队关联，或按 teamId 批量）
7. UserTeamFollow（如有测试数据）
8. Team（externalId 曾为 wc26-* 或仅 WC 国家队）
```

**禁止：** `WHERE externalId LIKE 'af-%'` 全局删除（五大联赛同为 AF）。

---

# 4. 数据库 Schema 调整

## 4.1 Team

**删除：**

```prisma
eloRating Int @default(1500)  // 整列删除
```

**保留/沿用（与现 schema 对齐）：**

```prisma
model Team {
  id            String   @id @default(cuid())
  externalId    String?  @unique   // 必须 af-t-{apiTeamId}
  nameCn        String               // AF 同步时必填
  nameEn        String
  shortName     String?
  logoUrl       String?
  country       String?
  founded       Int?
  dataSource    DataSourceType       // API_FOOTBALL
  wcGroup       String?              // 世界杯小组 A–L，可选
  wc2026Profile Json?                // 见 §7.3 Step 7 结构
  coachProfile  Json?
  powerRating   Float?               // OLS 关闭时不写入、不读取
  // ...
}
```

**P1 可选：**

```prisma
apiFootballTeamId Int? @unique  // 与 externalId 冗余，便于查询
```

**硬要求：**

```text
世界杯球队 externalId = af-t-{id}
dataSource = API_FOOTBALL
不再创建 wc26-{TLA}
```

## 4.2 Match

**已有：** `city`、`stadium`、`groupName` 等。

**建议新增：**

```prisma
model Match {
  // ...existing...

  intelContentHash     String?
  intelContentHashAt   DateTime?
  venueName            String?    // 可与 stadium 合并策略，二选一写清
  venueApiFootballId   Int?
}
```

**回填规则（Step 2 fixtures_wc）：**

```text
fixture.venue.city     → Match.city
fixture.venue.name     → Match.venueName 或 stadium
fixture.venue.id       → Match.venueApiFootballId
```

## 4.3 AiReport

**建议新增：**

```prisma
model AiReport {
  // ...existing...

  sourceIntelHash    String?    // 发布时 Match.intelContentHash 快照
  isStale            Boolean    @default(false)
  staleReason        String?
  staleDetectedAt    DateTime?
  forcedPublish      Boolean    @default(false)  // P1：超管强制发布
}
```

**说明：**

- `inputHash`（已有）：AI **版本**指纹，参与 `@@unique([matchId, reportType, inputHash])`
- `sourceIntelHash`：**发布时**底层情报指纹，用于判断 PUBLISHED 是否过期
- 二者**不可合并**

**状态枚举（实际）：** `NONE | DRAFT | REVIEW | PUBLISHED | ARCHIVED`（无 `READY`）

## 4.4 MatchAfRawBundle

**建议新增：**

```prisma
endpointHashes Json?
```

示例：

```json
{
  "fixtureJson": "sha256:...",
  "predictionsJson": "sha256:...",
  "oddsLatestJson": "sha256:...",
  "injuriesJson": "sha256:...",
  "h2hJson": "sha256:...",
  "lineupsJson": "sha256:...",
  "eventsJson": "sha256:...",
  "statisticsJson": "sha256:...",
  "playersJson": "sha256:...",
  "homeTeamStatsJson": "sha256:...",
  "awayTeamStatsJson": "sha256:..."
}
```

P0 也可在 `syncEndpoint` 完成时即时计算并写入；**推荐落库**便于任务中心排查。

## 4.5 TeamMatchSnapshot / WeatherSnapshot（P0 建议）

为 `intelContentHash` 稳定，建议增加：

```prisma
contentHash String?  // 对业务字段 stableJson 后 sha256
```

若 P0 不加列，临时对关键字段子集 hash（文档化字段列表）。

---

# 5. 环境配置

## 5.1 必填 / 推荐

```env
# AF
API_FOOTBALL_API_KEY=...
ENABLE_AF_RAW_BUNDLE=true
ENABLE_AF_FACTS_DUAL_WRITE=true    # 裁判、部分 MatchFacts；P0 强烈建议 true

# 预测（方案 A）
PREDICTION_PROVIDER=af
WC_PREDICTION_FALLBACK=none        # 实现为：WC 与全局均不 fallback

# OLS（世界杯与预测不读）
ENABLE_OLS=false

# 世界杯标识
WORLD_CUP_COMPETITION_CODE=WC
WORLD_CUP_TOURNAMENT_CODE=FIFA_WC
WORLD_CUP_SEASON=2026
WORLD_CUP_AF_LEAGUE_ID=1

# 天气（Bootstrap Step 11 / reconcile）
QWEATHER_API_KEY=...
QWEATHER_BASE_URL=...              # 按现有 WeatherService

# Cron（P1）
ENABLE_CRON_SYNC=true
```

## 5.2 行为约束

```text
任何比赛：禁止 ELO / model 回退写 MatchPrediction
AF predictions 缺失 → status FAILED，coverage red，gate 不通过
WC 比赛：dossier 不得出现 eloRating /「ELO 1500」类表述
```

---

# 6. AF 端点注册表

## 6.1 文件位置

```text
src/api-football/ingest-endpoint.registry.ts
```

**第一版：TypeScript 常量**，不做 DB 配置表。

## 6.2 类型定义

```ts
export type AfIngestScope = 'league' | 'team' | 'match';

export type AfIngestStage =
  | 'bootstrap'
  | 'pre_match'
  | 'live'
  | 'post_match';

export type AfIngestEndpointDefinition = {
  id: string;
  label: string;
  path: string;
  scope: AfIngestScope;
  requiredForWorldCup: boolean;
  stage: AfIngestStage[];
  storageKeys: string[];
  handlerName: string;
  hashInIntelContent: boolean;
  hashInAiReport: boolean;
  hashInPrediction: boolean;
  coverageWeight: number;
  staleSeverity: 'info' | 'warning' | 'critical';
};
```

## 6.3 注册表（v1.1 完整首批）

```ts
export const AF_INGEST_ENDPOINT_REGISTRY: AfIngestEndpointDefinition[] = [
  // --- 联赛级 bootstrap ---
  {
    id: 'fixtures_league',
    label: '联赛赛程批量',
    path: '/fixtures',
    scope: 'league',
    requiredForWorldCup: true,
    stage: ['bootstrap'],
    storageKeys: ['Match'],
    handlerName: 'syncFixturesWc',
    hashInIntelContent: false,
    hashInAiReport: false,
    hashInPrediction: false,
    coverageWeight: 10,
    staleSeverity: 'critical',
  },
  {
    id: 'teams',
    label: '球队列表',
    path: '/teams',
    scope: 'league',
    requiredForWorldCup: true,
    stage: ['bootstrap'],
    storageKeys: ['Team'],
    handlerName: 'syncTeamsInLeague',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 10,
    staleSeverity: 'critical',
  },
  {
    id: 'squads',
    label: '球队名单',
    path: '/players/squads',
    scope: 'team',
    requiredForWorldCup: true,
    stage: ['bootstrap'],
    storageKeys: ['Player'],
    handlerName: 'syncSquads',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 8,
    staleSeverity: 'warning',
  },
  {
    id: 'standings',
    label: '积分榜',
    path: '/standings',
    scope: 'league',
    requiredForWorldCup: true,
    stage: ['bootstrap', 'post_match'],
    storageKeys: ['CompetitionStanding'],
    handlerName: 'syncStandings',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: true,
    coverageWeight: 8,
    staleSeverity: 'warning',
  },
  {
    id: 'leaderboards',
    label: '射手/助攻榜',
    path: '/players/topscorers',
    scope: 'league',
    requiredForWorldCup: true,
    stage: ['bootstrap', 'post_match'],
    storageKeys: ['PlayerSeasonMetric'],
    handlerName: 'syncLeaderboards',
    hashInIntelContent: true,
    hashInAiReport: false,
    hashInPrediction: false,
    coverageWeight: 6,
    staleSeverity: 'info',
  },
  {
    id: 'team_statistics',
    label: '球队赛季统计',
    path: '/teams/statistics',
    scope: 'team',
    requiredForWorldCup: true,
    stage: ['bootstrap', 'pre_match'],
    storageKeys: ['Team.wc2026Profile', 'TeamMatchSnapshot'],
    handlerName: 'syncTeamStatistics',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: true,
    coverageWeight: 10,
    staleSeverity: 'critical',
  },

  // --- 场次级（syncSingleMatchFull 子集）---
  {
    id: 'fixture',
    label: '单场赛程',
    path: '/fixtures',
    scope: 'match',
    requiredForWorldCup: true,
    stage: ['bootstrap', 'pre_match', 'live', 'post_match'],
    storageKeys: ['MatchAfRawBundle.fixtureJson', 'Match.city'],
    handlerName: 'syncFixture',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: true,
    coverageWeight: 10,
    staleSeverity: 'critical',
  },
  {
    id: 'predictions',
    label: 'AF 赛前预测',
    path: '/predictions',
    scope: 'match',
    requiredForWorldCup: true,
    stage: ['pre_match'],
    storageKeys: ['MatchAfRawBundle.predictionsJson', 'MatchPrediction'],
    handlerName: 'syncPredictions',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: true,
    coverageWeight: 10,
    staleSeverity: 'critical',
  },
  {
    id: 'injuries',
    label: '伤停',
    path: '/injuries',
    scope: 'match',
    requiredForWorldCup: true,
    stage: ['pre_match'],
    storageKeys: ['MatchAfRawBundle.injuriesJson', 'MatchFacts.injuriesJson'],
    handlerName: 'syncInjuries',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 8,
    staleSeverity: 'warning',
  },
  {
    id: 'odds',
    label: '赔率',
    path: '/odds',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['pre_match'],
    storageKeys: ['MatchAfRawBundle.oddsLatestJson', 'MatchOddsSnapshot'],
    handlerName: 'syncOdds',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 6,
    staleSeverity: 'warning',
  },
  {
    id: 'h2h',
    label: '历史交锋',
    path: '/fixtures/headtohead',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['pre_match'],
    storageKeys: ['MatchAfRawBundle.h2hJson'],
    handlerName: 'syncHeadToHead',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 5,
    staleSeverity: 'info',
  },
  {
    id: 'lineups',
    label: '阵容',
    path: '/fixtures/lineups',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['pre_match', 'live'],
    storageKeys: ['MatchAfRawBundle.lineupsJson'],
    handlerName: 'syncLineups',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 6,
    staleSeverity: 'warning',
  },
  {
    id: 'coachs',
    label: '主教练',
    path: '/coachs',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['pre_match'],
    storageKeys: ['MatchAfRawBundle.homeCoachJson', 'MatchAfRawBundle.awayCoachJson'],
    handlerName: 'syncCoachs',
    hashInIntelContent: false,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 4,
    staleSeverity: 'info',
  },
  {
    id: 'match_statistics',
    label: '单场技术统计',
    path: '/fixtures/statistics',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['live', 'post_match'],
    storageKeys: ['MatchAfRawBundle.statisticsJson'],
    handlerName: 'syncMatchStatistics',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 6,
    staleSeverity: 'warning',
  },
  {
    id: 'match_players',
    label: '单场球员统计',
    path: '/fixtures/players',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['post_match'],
    storageKeys: ['MatchAfRawBundle.playersJson'],
    handlerName: 'syncMatchPlayers',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 5,
    staleSeverity: 'info',
  },
  {
    id: 'events',
    label: '比赛事件',
    path: '/fixtures/events',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['live', 'post_match'],
    storageKeys: ['MatchAfRawBundle.eventsJson'],
    handlerName: 'syncEvents',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 6,
    staleSeverity: 'warning',
  },
  {
    id: 'facts_dual_write',
    label: 'Facts 物化（含裁判）',
    path: 'internal:MatchAfFactsSync',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['pre_match', 'live', 'post_match'],
    storageKeys: ['MatchFacts', 'RefereeSnapshot'],
    handlerName: 'syncFactsDualWrite',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 5,
    staleSeverity: 'warning',
  },

  // --- 非 AF ---
  {
    id: 'weather',
    label: '和风天气',
    path: 'internal:WeatherService',
    scope: 'match',
    requiredForWorldCup: false,
    stage: ['pre_match'],
    storageKeys: ['WeatherSnapshot'],
    handlerName: 'syncWeather',
    hashInIntelContent: true,
    hashInAiReport: true,
    hashInPrediction: false,
    coverageWeight: 5,
    staleSeverity: 'warning',
  },
];
```

**工具函数：**

```ts
export function registryRequiredForWorldCup(): AfIngestEndpointDefinition[] {
  return AF_INGEST_ENDPOINT_REGISTRY.filter((e) => e.requiredForWorldCup);
}
```

---

# 7. 世界杯专用 Bootstrap Job

## 7.1 Bundle 定义

在 `src/data-pipeline/ingest-bundle.definitions.ts` 新增：

```text
worldcup_af_full_bootstrap
```

`IngestJobRun.kind` 同名字符串。

## 7.2 步骤顺序

| Step | id | 说明 |
|------|-----|------|
| 1 | `catalog_verify` | 校验/补全 FIFA_WC、WC、season |
| 2 | `fixtures_wc` | AF 赛程 + venue → city |
| 3 | `teams_af` | `/teams?league=1&season=` upsert `af-t-*` |
| 4 | `squads_wc` | 各队 `/players/squads` |
| 5 | `standings_wc` | 小组积分榜 → `CompetitionStanding` |
| 6 | `leaderboards_wc` | topscorers / topassists 等 |
| 7 | `team_profiles_wc` | 重构 `syncWc2026TeamProfilesFromApiFootball`，**无 ELO** |
| 8 | `matches_sync_full` | 每场 `AfSyncOrchestrator.syncSingleMatchFull` |
| 9 | `matches_pre_match_snapshot` | `MatchAfPreMatchSnapshotService` |
| 10 | `matches_prediction_af` | `generateFromApiFootball`，禁止 fallback |
| 11 | `matches_weather_t24` | 有 `city` 且开球≤24h → `WeatherService` |
| 12 | `matches_ai_draft` | **默认跳过**（见 §7.4） |
| 13 | `coverage_report` | 汇总绿黄红 + gate 统计 |

## 7.3 各步要点

### Step 1 — catalog_verify

确认存在：

```text
Tournament.code = FIFA_WC
Competition.code = WC
Season（如 2026-wc）
AF league id = 1（api-football.constants）
```

### Step 2 — fixtures_wc

```http
GET /fixtures?league=1&season={season}
```

写入：

```text
Match.externalId = af-f-{fixtureId}
Match.dataSource = API_FOOTBALL
homeTeamId / awayTeamId → 必须解析为 af-t-*（Step 3 可先跑或 syncFixtures 内联 upsert 球队）
Match.city / venueName / venueApiFootballId 从 fixture.venue 回填
```

**校验：** 任一场次主客 `externalId` 非 `af-t-*` → JobItem **FAILED**，不进入 Step 8。

### Step 3 — teams_af

```http
GET /teams?league=1&season={season}
```

```text
externalId = af-t-{id}
nameEn = team.name
nameCn = 映射表或暂用 nameEn（文档化中文名来源）
dataSource = API_FOOTBALL
禁止 wc26-*
```

### Step 4 — squads_wc

按队 `GET /players/squads?team=` → `Player`（`af-p-*` 或现有规则）。

### Step 5 — standings_wc

```http
GET /standings?league=1&season={season}
```

→ `CompetitionStanding`（多小组）；供 snapshot 的 `groupRank` 等。

### Step 6 — leaderboards_wc

```text
/players/topscorers
/players/topassists
/players/topyellowcards
/players/topredcards
```

→ `PlayerSeasonMetric`（表已存在则物化，否则 P0 写 profile 并标 P1 规范化）。

### Step 7 — team_profiles_wc

复用并重构 `syncWc2026TeamProfilesFromApiFootball`：

**`wc2026Profile` 建议结构：**

```json
{
  "source": "AF",
  "af": {
    "teamCard": {},
    "statistics": {},
    "ingestedAt": "ISO8601"
  },
  "manual": {
    "zhName": null,
    "storyTags": [],
    "editorNote": null
  }
}
```

```text
删除 worldFootballElo / 任何 ELO 键
manual 仅白名单键可 PATCH，事实数据只来自 AF
```

### Step 8 — matches_sync_full

```ts
await afSyncOrchestrator.syncSingleMatchFull(matchId, { delayMs })
```

```text
分批：maxParallel 默认 3
每场 IngestJobItem
单场失败不阻断 Job → PARTIAL_SUCCESS
sync 后写 endpointHashes
若 ENABLE_AF_FACTS_DUAL_WRITE → factsSync
```

### Step 9 — matches_pre_match_snapshot

`MatchAfPreMatchSnapshotService.syncByMatchId`（phase 可用 `T24` 逻辑）。

**快照应尽量包含：**

```text
groupName / groupRank / groupPoints / groupGoals*
recentForm
attackMetrics / defenseMetrics（有来源才写，见 §8.5）
teamStatsSource = AF
```

### Step 10 — matches_prediction_af

```ts
await predictionService.generateFromApiFootball(matchId, { fallback: 'none' })
```

```text
写 MatchPrediction：modelVersion=af-v1, dataSource=API_FOOTBALL
写 inputsHash
AF 缺预测 → FAILED，不创建 MODEL 行
```

### Step 11 — matches_weather_t24

```text
若 Match.city 为空 → coverage 标记 venueCityMissing，不造假
若在 T-24h 窗口且有 city → WeatherService.syncForMatch
```

### Step 12 — matches_ai_draft（P0 默认关闭）

**Bootstrap 请求默认：**

```json
{ "generateAiDrafts": false }
```

为 `true` 时仅对 `aiPublishable === true` 的场次生成 `AiReport` **DRAFT**，**永不自动 PUBLISHED**。

### Step 13 — coverage_report

写入 `IngestJobRun.resultSummary`：

```json
{
  "totalMatches": 0,
  "green": 0,
  "yellow": 0,
  "red": 0,
  "aiPublishable": 0,
  "aiBlocked": 0,
  "topMissing": ["predictions", "snapshot"]
}
```

## 7.4 Bootstrap 请求参数

```ts
type WorldCupBootstrapParams = {
  season?: number;              // default 2026
  maxParallel?: number;         // default 3
  dryRun?: boolean;             // default false
  skipExisting?: boolean;       // default true
  onlyFailed?: boolean;
  resumeFromStep?: string;
  generateAiDrafts?: boolean;   // default false
};
```

## 7.5 与现有代码关系

| 现有 | 整合方式 |
|------|----------|
| `importWorldCupFullBundle` | **删除**，逻辑迁入 orchestrator 各 step |
| `ingest-orchestrator` | 新增 `runWorldCupAfFullBootstrap` |
| `IngestJobRun` / `IngestJobItem` | 直接复用 |

---

# 8. Coverage 与 Publish Gate

## 8.1 服务位置

```text
src/world-cup/world-cup-coverage.service.ts
```

或 `src/admin-api/world-cup-coverage.service.ts`（由 `WorldCupAdminModule` 引用）。

## 8.2 单场 Coverage 结构

```ts
type WorldCupMatchCoverage = {
  matchId: string;
  externalId: string;
  kickoffAt: string;
  status: 'green' | 'yellow' | 'red';
  score: number; // 0–100
  endpoints: Array<{
    id: string;
    label: string;
    required: boolean;
    status: 'success' | 'empty' | 'missing' | 'stale' | 'not_applicable';
    lastSyncedAt?: string;
    message?: string;
  }>;
  gates: {
    aiPublishable: boolean;
    aiGeneratable: boolean;  // 可生成 DRAFT，门槛略低于 publishable
    reasons: string[];
  };
};
```

**计分建议：**

```text
required 端点 missing → red
required empty（AF 已调通为空）→ yellow，message 标明 empty
optional missing → yellow 或 info
```

## 8.3 AI 发布门禁（PUBLISHED 前强制）

必须全部满足：

```text
1. fixtureJson 存在且 success
2. MatchAfRawBundle.predictionsJson 存在（empty 则 blocked）
3. activePrediction 存在且 dataSource = API_FOOTBALL
4. activePrediction.modelVersion 含 af（如 af-v1）
5. factorBreakdown 无 ELO_FORM_FALLBACK / homeElo / awayElo
6. 主客各 ≥1 条 TeamMatchSnapshot，且 attack/defense 非「无来源默认 50」
7. dossier layers.afTeamComparison 可构建（AF comparison 存在）
8. injuries：已同步；empty 须在 coverage 标 empty，AI 文案走 dataAvailability
9. weather：存在 WeatherSnapshot；或 venueCityMissing / notInT24Window 明确标记
10. Match.intelContentHash 非空
11. AiReport.isStale === false（若重发需先 reconcile 或强制流程）
12. 比赛属于 WC / FIFA_WC
```

**不通过：** 发布 API 返回 422 + `reasons[]`；后台按钮 disabled。

## 8.4 AI 生成门禁（DRAFT，门槛略低）

```text
fixture + predictions + activePrediction(AF) + 主客 snapshot 存在
允许 injuries/weather/odds 为 empty（须在 dataAvailability 声明）
```

## 8.5 攻防评分：禁止静默 50

**代码修改（P0 必做）：** `src/api-football/af-pre-match-mapper.util.ts`

```text
无 goals 均值时：attackRating / defenseRating = null（或省略）
coverage 将 snapshot 标为 incomplete
dossier dataAvailability.teamSnapshots = partial
gate 6 不通过
```

**禁止：** 把 50 当作「AI 推演」默认值写进 LLM 输入。

## 8.6 强制发布（P1）

仅 `SUPER_ADMIN`：`forcedPublish=true` + 原因 + `AuditLog`。

---

# 9. Freshness（情报过期协调）

## 9.1 服务

```text
src/match-intel/match-intel-freshness.service.ts
```

## 9.2 触发点

在以下写入完成后调用 `refreshIntelContentHash(matchId)`：

```text
MatchAfRawBundle 任一端点 hash 变化
TeamMatchSnapshot upsert
WeatherSnapshot upsert
MatchPrediction persist（inputsHash 变）
MatchFacts / RefereeSnapshot 更新
```

## 9.3 intelContentHash 计算

**禁止** hash `updatedAt` / `fetchedAt` / `jobId`。

```ts
intelContentHash = sha256StableJson({
  bundle: pickEndpointHashes(bundle.endpointHashes, registry.hashInIntelContent),
  homeSnapshot: homeSnapshot.contentHash ?? hashSnapshotFields(home),
  awaySnapshot: awaySnapshot.contentHash ?? hashSnapshotFields(away),
  weather: weatherSnapshot?.contentHash ?? hashWeatherFields(weather),
  activePredictionInputsHash: match.activePrediction?.inputsHash ?? null,
});
```

写入：

```text
Match.intelContentHash
Match.intelContentHashAt = now()
```

## 9.4 AiReport stale 规则

| 状态 | intelContentHash 变化时 |
|------|-------------------------|
| DRAFT | 可自动 `generate(forceRegenerate)`（若开启 autoRefresh 配置） |
| REVIEW | 标记 `isStale=true`，建议 reconcile 后人工再审 |
| PUBLISHED | **仅** `isStale=true`，`staleReason`，**不覆盖正文** |
| ARCHIVED | 忽略 |

**发布时：**

```text
AiReport.sourceIntelHash = Match.intelContentHash
AiReport.isStale = false
```

**发布后检测（cron 或读时）：**

```text
if (PUBLISHED && sourceIntelHash !== Match.intelContentHash) → isStale=true
```

## 9.5 AI inputHash 扩展

文件：`src/ai-report/ai-report-input-hash.util.ts`

**纳入（稳定内容）：**

```text
bundle: fixtureJson, predictionsJson, oddsLatestJson, injuriesJson,
        h2hJson, lineupsJson, statisticsJson（按 registry.hashInAiReport）
主客 TeamMatchSnapshot.contentHash（或关键字段子集）
WeatherSnapshot.contentHash
activePrediction.inputsHash
```

**不纳入：**

```text
updatedAt, fetchedAt, createdAt, syncedAt, 随机 id
```

---

# 10. 预测服务（全局 AF only）

## 10.1 行为

```ts
// PredictionService.generateForMatch
async generateForMatch(matchId, opts) {
  return this.generateFromApiFootball(matchId, { ...opts, fallback: 'none' });
}
```

AF 缺失时：

```ts
throw new UnprocessableEntityException({
  code: 'AF_PREDICTION_MISSING',
  matchId,
});
```

或写 `MatchPrediction` 失败状态供 coverage 读取（二选一，文档化）。

## 10.2 MatchPrediction 写入要求

```text
dataSource = API_FOOTBALL
modelVersion = af-v1（或 AF_PREDICTION_MODEL_VERSION 常量）
inputsHash = computeInputsHash(AF payload + comparison + goals)
factorBreakdown 含 comparison / percent，不得含 ELO
```

## 10.3 与 dossier / C 端

```text
layers.prediction ← activePrediction
layers.afTeamComparison ← bundle.predictionsJson.comparison
禁止 layers.teams.eloRating
```

---

# 11. 世界杯 Admin API

**模块建议：**

```text
src/world-cup-admin/
  world-cup-admin.module.ts
  world-cup-admin.controller.ts
  world-cup-admin.service.ts
  world-cup-coverage.service.ts
```

挂载：`/admin/api/world-cup`（`AdminApiModule` import）。

## 11.1 总览

```http
GET /admin/api/world-cup/overview
```

```ts
{
  season: 2026,
  competitionCode: 'WC',
  totalMatches: number,
  teamsCount: number,
  playersCount: number,
  coverage: { green: number; yellow: number; red: number },
  gates: { aiPublishable: number; aiBlocked: number },
  missing: { predictions: number; snapshots: number; weather: number; odds: number },
  recentJobs: Array<{ id: string; kind: string; status: string; progressPct: number; startedAt: string }>,
  env: { afConfigured: boolean; qweatherConfigured: boolean; factsDualWrite: boolean }
}
```

## 11.2 一键 Bootstrap

```http
POST /admin/api/world-cup/bootstrap
```

Body：§7.4 → Response `{ jobId, status: 'PENDING' | 'RUNNING' }`

## 11.3 比赛列表

```http
GET /admin/api/world-cup/matches?coverage=red&status=SCHEDULED&page=1&limit=50
```

## 11.4 单场 Coverage

```http
GET /admin/api/world-cup/matches/:matchId/coverage
```

## 11.5 单场 Reconcile

```http
POST /admin/api/world-cup/matches/:matchId/reconcile
```

```ts
{ includeAi?: boolean; dryRun?: boolean }
```

**执行顺序：**

```text
syncSingleMatchFull
→ pre_match_snapshot
→ generateFromApiFootball
→ weather（若 city + 窗口）
→ refreshIntelContentHash
→（可选）aiReport.generate forceRegenerate
→ coverage 再算
```

返回 `{ jobId }`（单场也可用 `IngestJobItem` 挂在 batch job 下）。

## 11.6 球队

```http
GET /admin/api/world-cup/teams
POST /admin/api/world-cup/teams/:teamId/refresh-profile
```

## 11.7 批量预测

```http
POST /admin/api/world-cup/predictions/generate
{ matchIds?: string[]; onlyMissing?: boolean }
→ { jobId }
```

## 11.8 批量 AI Draft

```http
POST /admin/api/world-cup/ai/generate-drafts
{ matchIds?: string[]; onlyPublishable?: boolean; forceRegenerateDraft?: boolean }
→ { jobId }
```

## 11.9 发布 AI（走 gate）

```http
POST /admin/api/ai-reports/:id/publish
```

世界杯比赛：**服务端强制** §8.3 gate，不通过 422。

---

# 12. 运维后台前端（配合需求）

**顶级导航：** `世界杯 2026` → `/world-cup/*`

| 页面 | P0 后端支撑 |
|------|-------------|
| 总览驾驶舱 | `GET overview` |
| 一键入库 | `POST bootstrap` + 任务中心 Job |
| 赛程与场次 | `GET matches` + `GET coverage` + `POST reconcile` |
| 球队档案 | `GET teams` + `POST refresh-profile` |
| 积分榜 & 射手 | 可读 `CompetitionStanding` / `PlayerSeasonMetric` 现有 API 或 WC 专用只读接口 |
| 预测 & AI | `POST predictions/generate` + `POST ai/generate-drafts` |
| 数据门禁 | coverage.gates + 发布按钮 disabled 理由 |

---

# 13. 任务中心

## 13.1 Job kind 列表

```text
worldcup_af_full_bootstrap
worldcup_match_reconcile
worldcup_predictions_generate
worldcup_ai_drafts_generate
worldcup_team_profile_refresh
```

## 13.2 IngestJobRun 字段（复用现有）

```text
kind, status, bundleId, progressPct, stepLabel, params, resultSummary, errorMessage, startedAt, finishedAt
```

**status 语义：** `RUNNING | SUCCESS | PARTIAL_SUCCESS | FAILED | CANCELED`

## 13.3 IngestJobItem

```text
matchId, itemType, status, currentStep, errorCode, errorMessage, metadataJson
```

---

# 14. Cron（P1，P0 只预留方法）

| Cron | 窗口 | 动作 |
|------|------|------|
| `wc-pre-match-t48` | T-48h | predictions, injuries, odds, snapshot |
| `wc-pre-match-t24` | T-24h | sync-full, weather, prediction, freshness, 可选 AI draft |
| `wc-pre-match-t1` | T-1h | odds, lineups, injuries, prediction refresh, stale 标记 |
| `wc-live-tick` | LIVE | events, statistics, lineups |
| `wc-post-match` | FINISHED | stats, players, standings, leaderboards, post-match AI |

**联赛通用** `scheduled_pre_match_bootstrap` **不替代** WC 专轨；WC 比赛以 WC cron + 运维 reconcile 为主。

---

# 15. 开发顺序（推荐 7 步）

| Step | 内容 | 验收 |
|------|------|------|
| **1** | 删旧文件/接口；migration 删 `eloRating`；清 ELO 代码路径；`PREDICTION_PROVIDER=af` | 全仓无运行时 elo/wc26 |
| **2** | `ingest-endpoint.registry.ts` | 可列出 WC 必填端点 |
| **3** | `WorldCupCoverageService` + mapper 去默认 50 | 单场 coverage + red 原因正确 |
| **4** | `worldcup_af_full_bootstrap` + Job | POST bootstrap 可查任务中心 |
| **5** | Prediction AF only + FAILED 语义 | 无 MODEL/ELO 预测行 |
| **6** | Freshness + inputHash 扩展 + AiReport stale 字段 | hash 变 → PUBLISHED stale |
| **7** | `/admin/api/world-cup/*` + 发布 gate | 后台可运维、缺数据不可发布 |

**并行：** admin-web 世界杯模块页面（Step 7 起对接）。

---

# 16. 验收标准（QA Checklist）

## 16.1 数据源

- [ ] 世界杯球队均为 `af-t-*`，无 `wc26-*`
- [ ] 世界杯比赛均为 `af-f-*`
- [ ] `Team` 无 `eloRating` 列
- [ ] API/C 端不返回 `eloRating`

## 16.2 预测

- [ ] 全部 `MatchPrediction.dataSource = API_FOOTBALL`
- [ ] 无 `ELO_FORM_FALLBACK` / `MODEL` 新写入
- [ ] AF predictions 缺失 → coverage **red**，gate 不通过

## 16.3 Bootstrap

- [ ] `POST /admin/api/world-cup/bootstrap` 返回 `jobId`
- [ ] 完成后存在：Match、Team、Player、Standing、Bundle、Snapshot、Prediction
- [ ] `resultSummary` 含 green/yellow/red
- [ ] 失败场次在 JobItem 可查

## 16.4 AI Gate

- [ ] 缺 predictions → 不可发布
- [ ] 缺 snapshot / 无来源攻防 → 不可发布
- [ ] `isStale=true` 的 PUBLISHED → 不可再次发布或需 reconcile
- [ ] 文案无 ELO 1500（抽检 + rawInput.dossier）

## 16.5 Freshness

- [ ] 更新 predictions 后 `intelContentHash` 变化
- [ ] PUBLISHED 仅 stale，正文不变
- [ ] DRAFT 可 `forceRegenerate`

## 16.6 Admin API

- [ ] overview / matches / coverage / reconcile / bootstrap 可用

## 16.7 集成场景

1. Mock 一场 WC：无 predictions → red → reconcile 补 predictions → yellow/green  
2. 改 odds → `intelContentHash` 变 → 已发布报告 `isStale=true`

---

# 17. 测试建议

## 17.1 单元测试

```text
registryRequiredForWorldCup()
coverage red/yellow/green
publish gate reasons
intelContentHash 稳定性（同内容同 hash）
PredictionService fallback none
af-pre-match-mapper 无数据不为 50
```

## 17.2 回归搜索

```bash
rg "eloRating|worldFootballElo|wc26-|ELO_FORM_FALLBACK|homeElo|awayElo" src admin-web prisma
```

期望：业务路径无匹配（seed/迁移历史除外）。

---

# 18. P0 / P1 / P2 范围

## P0（必须交付）

```text
删旧 + migration
AF registry
Coverage + Gate
mapper 去假默认
worldcup_af_full_bootstrap Job
Prediction 全局 AF only
Freshness + inputHash + AiReport stale
/admin/api/world-cup/* 核心 API
发布 gate 服务端强制
运维页：总览 / 入库 / 场次 / reconcile
```

## P1

```text
WC Cron 五档
forcedPublish + AuditLog
apiFootballTeamId 列
endpointHashes 全量落库
球队中文名映射表维护 UI
```

## P2

```text
/odds/live, /trophies, /sidelined, /players/profiles, /fixtures/rounds
手工 profile 富文本后台
PDF 运维手册
```

---

# 19. 最终交付清单

后端完成 P0 后应交付：

```text
1. Prisma migration：删 eloRating；增 Match/AiReport/Bundle 相关字段
2. 删除 wc26/json/elo 导入与旧 import-bundle
3. ingest-endpoint.registry.ts
4. WorldCupCoverageService + gate 单元测试
5. af-pre-match-mapper 去除无来源 50
6. worldcup_af_full_bootstrap（ingest-bundle + orchestrator + Job）
7. PredictionService 全局 AF only + AF_PREDICTION_MISSING
8. MatchIntelFreshnessService + inputHash 扩展
9. WorldCupAdminController 全套 API
10. AiReport 发布接口接入 WC gate
11. C 端/BFF/competitions 去除 eloRating
12. docs：本文件 + 验收 checklist
```

---

# 20. 总结

> **世界杯 2026 从现在开始只认 AF。** 旧 JSON、`wc26-*`、ELO、model 回退全部退出。后端以 **registry + bootstrap Job + coverage/gate + 双 hash（intelContentHash / inputHash）** 建立可运维、可扩展、可审计链路；AI **数据齐才生成、发布前门禁、发布后只标 stale 不静默覆盖**。

---

**文档路径建议（落地时）：** `docs/world-cup-af-cutover-v1.1.md`

