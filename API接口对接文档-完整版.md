# API 接口对接文档（完整版 · 以源码为准）

> **生成说明**：根据仓库内 `src/**/*.controller.ts`、`src/app.module.ts`、全局 **`JwtAuthGuard`**、**`ResponseInterceptor`**、**`HttpExceptionFilter`**、`src/common/guards/admin.guard.ts` 等与 **2026-05-15** 代码一致整理。  
> **适用范围**：小程序 / H5 / 第三方 JSON 客户端对接；运维与 Admin 工具链；不含 Cron 内部逻辑（Cron 非 HTTP）。  
> **OpenAPI**：**非 production** 默认暴露 **`{API_ORIGIN}/docs`**（根路径 `/` 会 302 到 `/docs`）。**production** 默认 **不挂载** Swagger；需显式设置 **`ENABLE_SWAGGER_DOCS=true`** 后才有 `/docs`，此时 `/` 仍 302 到 `/docs`；未开启时 **`GET /`** 返回纯文本标识。  
> **关联文档**：产品向叙述见 **`第二期前端对接规范文档.md`**；库表、环境变量、Cron 细则见 **`开发文档.md`**。

---

## 1. 基础约定
 
| 项 | 说明 |
|----|------|
| **Base URL** | 由部署决定，记为 `{API_ORIGIN}`（勿写死示例域名）。 |
| **协议** | HTTPS（生产）。 |
| **JSON** | `Content-Type: application/json`（另有注明的 `multipart/form-data` 除外）。 |
| **认证（默认）** | 全局注册 **`JwtAuthGuard`**：未标 **`@Public()`** 的接口需要 **`Authorization: Bearer <accessToken>`**。 |
| **管理员** | 标 **`@AdminOnly()` + `AdminGuard`** 的接口：JWT 有效且 **`User.role === ADMIN`**，否则 **403** `Admin only`。 |
| **成功响应** | 多数 JSON 经 **`ResponseInterceptor`** 包装为 `{ "success": true, "data": <业务体>, "message": "ok" }`。若返回体已是含 `success` 的对象，或命中 **`@SkipEnvelope()`** / 响应头 **`X-Skip-Envelope`**，则不二次包装。 |
| **错误响应** | **`HttpExceptionFilter`**：`{ "success": false, "message": "<文案>", "errorCode": "<异常名>" }`，HTTP 状态码与异常一致。 |
| **AdminView** | 前缀 **`/admin-view/*`** 为 **EJS/HTML**（`AdminViewController` 带 **`@SkipEnvelope()`**），小程序**忽略**；需浏览器与管理员会话/JWT 粘贴等（见该模块实现）。 |

### 1.1 鉴权速查

| 标记 | JWT | 角色 |
|------|:---:|:----|
| `@Public()` | 否 | 任意 |
| 默认 | 是 | 任意登录用户 |
| `@AdminOnly()` + `AdminGuard` | 是 | **ADMIN** |

### 1.2 微信支付回调说明（运维）

- **`POST /wxpay/notify`** 标 **`@Public()`**（微信服务器调用，非小程序）。  
- 请求体验签/解密见 **`WxpayService` / `WechatPayV3Service`**（`main.ts` 启用 **`rawBody: true`**）。  
- **注意**：当前未对回调控制器单独 **`@SkipEnvelope()`**，成功时业务返回 `{ code, message }` 可能仍被包装为 `{ success, data: { code, message }, message: "ok" }`。若商户平台报「通知应答异常」，需对照微信文档核对应答 JSON 形态，必要时在代码层为回调跳过包装。

---

## 2. C 端（小程序主链）— JSON API

以下接口为 **C 端读模型 / 登录 / 订单 / 海报 / 世界杯关注** 等；**不含** 生成类运维接口。

### 2.1 公开（无需 JWT）

| METHOD | 路径 | Query / Body 摘要 |
|--------|------|---------------------|
| GET | `/health` | `?db=1` 或 `?db=true` 时附带数据库探测 |
| GET | `/tournaments` | `type?`（`TournamentType` 枚举）, `isActive?`（`true`/`false` 字符串） |
| GET | `/tournaments/:code` | — |
| GET | `/tournaments/:code/competitions` | — |
| GET | `/tournaments/:code/matches` | — |
| GET | `/tournaments/:code/standings` | `group?`（与 `Match.groupName` 一致，如小组赛 `A`） |
| GET | `/seasons` | — |
| GET | `/seasons/:id` | — |
| GET | `/competitions` | `tournamentId?`, `seasonId?` |
| GET | `/competitions/:id/worldcup2026-schedule/:teamId` | 须在泛化 `:id` 之前注册（源码已排序） |
| GET | `/competitions/:id/worldcup2026-teams/:teamId` | `slim?` = `1` / `true` 精简 |
| GET | `/competitions/:id/worldcup2026-teams` | `slim?` |
| GET | `/competitions/:id/standings` | `group?`（由已完赛场次聚合积分） |
| GET | `/competitions/:id` | — |
| GET | `/matches` | `tournamentId?`, `competitionId?`, `seasonId?`, `status?` |
| GET | `/matches/:id/intel` | 可选带 `Authorization`：匿名或登录态影响解锁展示 |
| GET | `/matches/:id/analysis-preview` | 可选 Bearer；分析页只读聚合（战术/Fantasy/交锋/球员情报计数），解锁边界与 `intel` 一致 |
| GET | `/matches/:id` | 同上 |
| GET | `/rankings/players` | `competitionId?`, `metric?`（`powerRating` \| `fantasyPrice` \| `fbrefMinutes`）, `limit?` |
| GET | `/players/:id/summary` | 球员公开摘要（榜单/对比） |
| GET | `/insights/upset-signals` | `from?`, `to?`, `limit?`, `minUpset?`（ISO 时间；默认近/后各约 14 天） |
| GET | `/cms/tools` | 工具入口配置（内置默认列表） |
| GET | `/cms/materials` | `category?` |
| GET | `/orders/pricing` | **V2 价目**（公开；类上 Swagger 可能仍显示 Bearer，以 **`@Public()`** 为准） |
| POST | `/auth/wechat-login` | `{ "code", "nickname?", "avatarUrl?" }` |
| POST | `/auth/phone/send-code` | `{ "phone" }`（11 位大陆号） |
| POST | `/auth/phone/register` | `{ "phone", "code", "password?" }` |
| POST | `/auth/phone/login-password` | `{ "phone", "password" }` |
| POST | `/auth/phone/login-otp` | `{ "phone", "code" }` |
| POST | `/wxpay/notify` | 微信回调；原始 body 验签 |
| POST | `/feedback` | `{ "message", "contact?" }`；可选 Bearer 写入 `userId`（匿名亦可） |
| GET | `/football-feed/*` | 上游 api-sports 代理；Query 见 **§4** 与 Swagger |

### 2.2 需 JWT（登录用户）

| METHOD | 路径 | 说明 |
|--------|------|------|
| GET | `/matches/:id/unlock-status` | 当前用户本场是否视为已解锁 |
| POST | `/orders/matches/:matchId/create` | 单场报告解锁订单；**须已发布报告**且未完赛等业务校验见 `OrdersService` |
| POST | `/orders/membership/create` | Body：`{ "plan": "month" \| "quarter" \| "year" }` |
| POST | `/orders/social-poster/matches/:matchId/create` | 社交海报付费订单 |
| GET | `/orders/:orderNo` | 当前用户订单详情 |
| POST | `/matches/:id/social-poster/generate` | 海报出图；Body 可选 `{ "customElements?" }`（`SocialPosterController`） |
| POST | `/auth/bind-phone` | `{ "phone", "code" }` |
| POST | `/auth/bind-wechat` | `{ "code", "nickname?", "avatarUrl?" }` |
| PATCH | `/auth/password` | `newPassword`；已设密码时需 `currentPassword` |
| PATCH | `/auth/profile` | 可选 `nickname`, `avatarUrl` |
| GET | `/auth/me` | 当前用户公开字段 |
| GET | `/worldcup2026/me/team-follows` | 关注列表 |
| POST | `/worldcup2026/me/team-follows` | Body：`{ "teamId" }` |
| DELETE | `/worldcup2026/me/team-follows/:teamId` | 取消关注 |
| GET | `/worldcup2026/me/team-follows/:teamId/status` | 是否已关注 |
| GET | `/me/favorite-matches` | 收藏比赛列表（含 `match` 摘要） |
| POST | `/me/favorite-matches` | Body：`{ "matchId" }` |
| DELETE | `/me/favorite-matches/:matchId` | 取消收藏 |
| GET | `/me/match-reminders` | 提醒列表 |
| POST | `/me/match-reminders` | `matchId`, `notifyOffsetMinutes?`, `channel?` |
| PATCH | `/me/match-reminders/:id` | `notifyOffsetMinutes?`, `channel?`, `active?` |
| DELETE | `/me/match-reminders/:id` | — |
| GET | `/me/preferences` | `{ "data": { ... } }` |
| PATCH | `/me/preferences` | 顶层 key 浅合并进 `data` |
| GET | `/me/social-posters` | `cursor?`（上一页最后 `orderNo`）, `limit?` |
| GET | `/me/report-unlocks` | 已购单场报告解锁列表 |
| GET | `/me/orders` | `product?`（`OrderProduct` 枚举名）, `cursor?`, `limit?` |

### 2.3 关键业务前置（摘要）

- **微信支付 JSAPI**：下单需用户 **`openid` 非空**（`OrdersService.attachWxJsapiPayParams`）；手机注册用户需先 **`POST /auth/bind-wechat`**。  
- **报告解锁**：`POST /orders/matches/:matchId/create` — 已完赛可能直接 `isUnlocked`；未发布报告 **400**；Pro / 已有解锁无新单等见服务实现。  
- **情报接口**：`GET /matches/:id/intel`、`GET /matches/:id`、`GET /matches/:id/analysis-preview` 支持**可选** Bearer，用于解锁态与预览字段；带 Bearer 时 `CdnCacheHeadersInterceptor` 对上述 `matches` 相关 GET 可能标 `private, no-store` 并 `Vary: Authorization`。

### 2.4 `GET /matches/:id/intel` — `teams` 战力字段（与 OLS 预测一致）

业务体为 **`MatchIntelResponse`**（见 `src/matches/match-intel.types.ts` / `buildMatchIntelResponse`）。`data.teams.home` / `data.teams.away` 中与「战力」相关的两个数**含义不同**，前端展示时请区分文案，勿混用：

| 字段 | 含义 | 数据来源 |
|------|------|----------|
| **`powerRating`** | **本场 OLS 基础 TPR**（与胜率模型分项一致） | 优先读取本场 `MatchPrediction.factorBreakdown.ols.homeBaseTpr` / `awayBaseTpr`；若预测缺失或因子中无 `ols` 分项，则回退 **`Team.powerRating`**（可能来自他场同步，仅兜底）。 |
| **`matchPower`** | **本场单场修正战力**（主场优势、伤病、疲劳等叠加后的单场值） | 本场 `MatchPrediction.homeMatchPower` / `awayMatchPower`；无预测时为 `null`。 |

与 **`freeLayer.predictionPreview.homeMatchPower` / `awayMatchPower`** 同源；未解锁时 preview 仍可展示概率与单场战力，`teams.matchPower` 与之一致便于同一卡片内对齐。

若 OLS 同步失败，`factorBreakdown.ols` 可能为 `null`，此时 `teams.*.powerRating` 仅依赖 `Team` 表兜底。

---

## 3. 管理员 JSON API（JWT + `role=ADMIN`）

以下控制器在类级别 **`@AdminOnly()` + `@UseGuards(AdminGuard)`**（或方法级等价），**均需** `Authorization: Bearer` 且用户为管理员。

### 3.1 `GET /admin/*` — `AdminController`（`@Controller('admin')`）

| METHOD | 路径 |
|--------|------|
| GET | `/admin/dashboard` |
| POST | `/admin/auto-intel/run` |
| GET | `/admin/match-data-report` |
| GET | `/admin/tournaments` |
| GET | `/admin/competitions` |
| GET | `/admin/seasons` |
| GET | `/admin/matches` |
| GET | `/admin/matches/:id` |
| POST | `/admin/matches/:id/pipeline/intel-full` |
| GET | `/admin/deepseek/smoke` |
| GET | `/admin/api-football/status` |
| POST | `/admin/api-football/world-cup/import-bundle` |
| PATCH | `/admin/worldcup2026-teams/:teamId` |
| POST | `/admin/tournaments/seed-default` |
| GET | `/admin/orders` |
| GET | `/admin/unlocks` |
| GET | `/admin/sources` |
| GET | `/admin/provider-mappings` |
| POST | `/admin/provider-mappings` |
| GET | `/admin/api-logs` |

**Body 提示（节选）**

- **`POST /admin/auto-intel/run`**：`AutoIntelRunDto` — `mode?`（`prediction` \| `full`）、`lookaheadHours?`、`lookbackHours?`、`maxMatches?`、`delayMs?`、`skipAiReport?`（默认 true）。  
- **`POST /admin/matches/:id/pipeline/intel-full`**：`IntelPipelineRunDto` — `stopOnFailure?`、`skipFdIntel?`、`skipPublicSources?`、`skipWeather?`、`skipDeepseekSmoke?`、`skipAiReport?`。  
- **`POST /admin/api-football/world-cup/import-bundle`**：`season`（默认 2026）、`delayBetweenRequestsMs`、`maxMatchesForEnrich`、`maxTeamsForWcProfiles`、`skipFixtures`、`skipSquads`、`skipWcProfiles`、`skipEnrich` 等（与 Admin-View 表单字段对齐，见 `AdminController` 源码）。  
- **`PATCH /admin/worldcup2026-teams/:teamId`**：`UpdateWc2026TeamDetailDto`（仅 `externalId` 前缀 `wc26-` 的 `Team`）。

### 3.2 `GET|POST /admin/data-ingest/*` — `DataIngestController`

| METHOD | 路径 |
|--------|------|
| POST | `/admin/data-ingest/fd-finished` |
| POST | `/admin/data-ingest/fd-player-squads` |
| POST | `/admin/data-ingest/openfootball/league` |
| POST | `/admin/data-ingest/statsbomb/open-data` |
| GET | `/admin/data-ingest/statsbomb/catalog` |
| POST | `/admin/data-ingest/statsbomb/batch` |
| POST | `/admin/data-ingest/api-football/fixtures` |
| POST | `/admin/data-ingest/api-football/squads` |
| POST | `/admin/data-ingest/structure-raw` |
| GET | `/admin/data-ingest/jobs/recent` |
| GET | `/admin/data-ingest/player-audit` |
| POST | `/admin/data-ingest/player-audit/run` |
| POST | `/admin/data-ingest/fbref/players-csv` | `multipart/form-data`，字段 **`file`** + `competitionCode` + `seasonTag` 等（见 Swagger / 源码） |

### 3.3 `POST /football-data/*` — `FootballDataController`

| METHOD | 路径 |
|--------|------|
| POST | `/football-data/sync/competitions` |
| POST | `/football-data/sync/competition/:code/matches` |
| POST | `/football-data/sync/competition/:code/standings` |
| POST | `/football-data/sync/all-basic` |
| POST | `/football-data/sync/match/:matchId/intel` |
| POST | `/football-data/sync/poll-recent-match-status` | Body 可选：`lookbackHours`、`lookaheadMinutes`、`maxMatches`、`delayBetweenMs` |

### 3.4 `GET|POST /public-sources/*` — `PublicSourcesController`

| METHOD | 路径 |
|--------|------|
| POST | `/public-sources/matches/:id/fetch` | Query：`force?=true` |
| GET | `/public-sources/competitions/:competitionId/teams-for-fetch` | Query：`seasonId?` |
| GET | `/public-sources/matches/:id` | 列表 |
| POST | `/public-sources/matches/:id/manual` | Body：`title?`, `content?`, `sourceUrl?` |
| POST | `/public-sources/import/kaggle-placeholder` | Body：`Record` |

### 3.5 `POST /weather/*` — `WeatherController`

| METHOD | 路径 |
|--------|------|
| POST | `/weather/matches/:id/sync` | |

### 3.6 挂载在根路径的「单场生成 / 读」— 多模块 `@Controller()`

以下路径在各自模块中声明为**完整路径**（无前缀），**均为 Admin**：

| METHOD | 路径 |
|--------|------|
| POST | `/matches/:id/generate-prediction` |
| GET | `/matches/:id/player-intelligence` |
| POST | `/matches/:id/player-intelligence/generate` |
| POST | `/matches/:id/tactics/generate` |
| GET | `/matches/:id/tactics` |
| POST | `/matches/:id/fantasy/generate` |
| GET | `/matches/:id/fantasy` |
| POST | `/fantasy/fpl/sync` |
| POST | `/matches/:id/head-to-head/generate` |
| GET | `/matches/:id/head-to-head` |
| POST | `/head-to-head/import/manual` |
| POST | `/head-to-head/import/kaggle-placeholder` |
| POST | `/matches/:id/social-guide/generate` |
| GET | `/matches/:id/social-guide` |
| GET | `/matches/:id/social-poster/prompt-preview` |
| GET | `/matches/:id/llm-dossier` | Query：`prepare?` = `0` \| `1` |
| POST | `/matches/:id/generate-report` |
| POST | `/matches/:id/publish-report` |
| GET | `/matches/:id/reports` |

### 3.7 `PATCH|PUT /matches/*` — `MatchesController`（Admin）

| METHOD | 路径 |
|--------|------|
| PATCH | `/matches/:id` | Body：`UpdateMatchDto` |
| PUT | `/matches/:id/team-snapshots` | Body：`{ "snapshots": [...] }` |
| PUT | `/matches/:id/player-snapshots` | Body：`{ "snapshots": [...] }` |

### 3.8 `POST|PATCH /competitions` — `CompetitionsController`（Admin）

| METHOD | 路径 |
|--------|------|
| POST | `/competitions` | `CreateCompetitionDto` |
| PATCH | `/competitions/:id` | `UpdateCompetitionDto` |

### 3.9 `POST|PATCH /seasons` — `SeasonsController`（Admin）

| METHOD | 路径 |
|--------|------|
| POST | `/seasons` | 创建 |
| PATCH | `/seasons/:id` | 更新 |

---

## 4. 公开上游代理 — `GET /football-feed/*`

**控制器**：`FootballFeedController`（**`@Public()`**）。需配置 **`API_FOOTBALL_API_KEY`**；返回体一般为 api-sports 风格（`get` / `parameters` / `errors` / `results` / `paging` / `response`）。详细 Query 以 **`src/football-feed/dto/football-feed.query.dto.ts`** 与 **`/docs`** 为准。

| METHOD | 路径 |
|--------|------|
| GET | `/football-feed/fixtures` |
| GET | `/football-feed/fixtures/lineups` |
| GET | `/football-feed/fixtures/statistics` |
| GET | `/football-feed/fixtures/events` |
| GET | `/football-feed/fixtures/h2h` |
| GET | `/football-feed/fixtures/detail/:fixtureId` |
| GET | `/football-feed/teams` |
| GET | `/football-feed/teams/statistics` |
| GET | `/football-feed/players` |
| GET | `/football-feed/players/profiles` |
| GET | `/football-feed/players/squads` |
| GET | `/football-feed/players/seasons` |
| GET | `/football-feed/players/topscorers` |
| GET | `/football-feed/injuries` |
| GET | `/football-feed/predictions` |
| GET | `/football-feed/odds` |
| GET | `/football-feed/standings` |

---

## 5. 管理后台 HTML — `GET|POST /admin-view/*`

**控制器**：`AdminViewController`，前缀 **`admin-view`**（可通过 **`ADMIN_VIEW_PATH_PREFIX`** 配置，默认 `/admin-view`），整类 **`@SkipEnvelope()`**（响应不为统一 JSON 包装）。  
**用途**：浏览器运维（Dashboard、比赛列表、数据入库、杯赛工具、订单等）。路径较多，以下为**索引级**列举（完整以源码为准）：

- **登录与会话**：`GET .../login`、`POST .../password-login`、`POST .../session`  
- **Dashboard**：`GET .../`、`POST .../dashboard/actions/*`（含 seed、auto-intel 等）  
- **资源浏览**：`tournaments`、`competitions`、`seasons`、`matches`、`orders`、`unlocks`、`sources`、`api-logs`、`data-report`、`player-data` 等  
- **比赛运维**：`GET .../matches/:id`、`POST .../matches/:id/actions/*`（公开来源、天气、同步、管线、生成、发布、焦点战等）  
- **数据入库**：`GET .../data-ingest`、`POST .../data-ingest/actions/*`（与 REST `admin/data-ingest` 能力重叠部分同源）  
- **世界杯**：`worldcup2026-teams`、`worldcup2026-team-detail/:teamId`、`competitions/:id/tools`、`POST .../competitions/:id/actions/worldcup-api-football-bundle` 等  

小程序**勿调用**该前缀。

---

## 6. 路由与控制器注册注意

1. **`CompetitionsController`**：`worldcup2026-*` 路由须写在 **`GET /competitions/:id`** 之前（源码已满足）。  
2. **`MatchesController` + `SocialPosterController`**：均使用前缀 **`/matches`**；C 端海报生成为 **`POST /matches/:id/social-poster/generate`**（需 JWT，非 `@Public()`）。  
3. **Admin 根路径接口**：如 **`POST /matches/:id/generate-prediction`** 与 C 端 **`GET /matches/:id`** 共用前缀但方法不同，无冲突。

---

## 7. 文档维护

- 接口增删改后，请同步更新本文档；**非 production** 或 **`ENABLE_SWAGGER_DOCS=true`** 时同步 **`/docs`** Swagger 注解。  
- 环境变量、Cron、Prisma 模型以 **`开发文档.md`** 与 **`prisma/schema.prisma`** 为准。  
- 产品级说明、抽检清单可与 **`第二期前端对接规范文档.md`**、**`README.md`**、**`测试文档-完整版.md`** 交叉引用；生产无 `/docs` 时**以源码与本文档为准**。
