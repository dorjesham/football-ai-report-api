# API 接口对接文档（完整版 · 以源码为准）

> **版本**：2026-05-20 · 绿库 / detail-v2 / AI 发布 / 榜单中心  
> **生成说明**：根据仓库内 `src/**/*.controller.ts`、`src/app.module.ts`、全局 **`JwtAuthGuard`**、**`ResponseInterceptor`**、**`HttpExceptionFilter`**、`src/common/guards/admin.guard.ts` 等与 **2026-05-20** 代码一致整理。  

**修订说明（2026-05-20）**

- 补齐 **`GET /rankings/leaderboards`**、**`/api/v2/*`** 路由母本；**`GET /matches/:matchId/detail-v2`** 与 v2 主路径等价说明。
- 明确 C 端 **仅 `PUBLISHED` AI 报告**可见；`paidModules.aiReports` 三态（hasData / locked / data）。
- **Deprecated（90 天）**：`intel`、`pre-match`、`post-match`、`analysis-preview`；**不含** `live` / `live/stream`。
- 扩充下单前置（完赛免费、未发布 400）、三页 `narrative` 与 ADMIN 预览规则。
- 行为变更须同步 [Web前端对接文档-完整版.md](./Web前端对接文档-完整版.md)、[小程序前端对接文档-完整版.md](./小程序前端对接文档-完整版.md) §5–§7、§9、§12。
> **适用范围**：**Web / 小程序 / H5** 等 C 端 JSON 客户端对接；运维与 Admin 工具链；不含 Cron 内部逻辑（Cron 非 HTTP）。  
> **分端主文档（请优先交付前端）**：**Web** → [Web前端对接文档-完整版.md](./Web前端对接文档-完整版.md)；**小程序** → [小程序前端对接文档-完整版.md](./小程序前端对接文档-完整版.md)。本文 §2 为路由母本，平台差异（登录/支付/SSE）见分端文档。  
> **Web 全量接入**：路由全集以本文 **§2** 与 **`{API_ORIGIN}/docs`** 为准；接入顺序与 mock 替换清单见 **§2.5**；缺口追踪见 **`缺少的接口-web前端.md`**。  
> **OpenAPI**：**非 production** 默认暴露 **`{API_ORIGIN}/docs`**（根路径 `/` 会 302 到 `/docs`）。**production** 默认 **不挂载** Swagger；需显式设置 **`ENABLE_SWAGGER_DOCS=true`** 后才有 `/docs`，此时 `/` 仍 302 到 `/docs`；未开启时 **`GET /`** 返回纯文本标识。  
> **关联文档**：产品向叙述（Cron、轮询、`liveStatusSyncHint` 等）见 **`第二期前端对接规范文档.md`**；库表、环境变量、Cron 细则见 **`开发文档.md`**。

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

## 2. C 端（Web / 小程序主链）— JSON API

以下接口为 **C 端读模型 / 登录 / 订单 / 海报 / 用户偏好 / 世界杯关注 / 赛中三页合同** 等；**不含** Admin 生成类运维接口（见 **§3.6**）。

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
| GET | `/competitions/match-counts` | `from?`, `to?`（ISO）, `status?`, `tournamentId?`, `seasonId?`；按 `competitionId` 聚合 `matchCount`（侧边栏联赛计数） |
| GET | `/competitions/:id/worldcup2026-schedule/:teamId` | 须在泛化 `:id` 之前注册（源码已排序） |
| GET | `/competitions/:id/worldcup2026-teams/:teamId` | `slim?` = `1` / `true` 精简 |
| GET | `/competitions/:id/worldcup2026-teams` | `slim?` |
| GET | `/competitions/:id/standings` | `group?`（由已完赛场次聚合积分） |
| GET | `/leagues/standings` | `codes?`（默认 PL,PD,SA,BL1,FL1,CL,EL）、`season?`（默认 2025）、`source?`（`auto` \| `db` \| `api_football`） |
| GET | `/leagues/:code/standings` | `season?`, `source?`；BFF 规范化 api-sports 积分榜 |
| GET | `/competitions/:id` | — |
| GET | `/matches` | `tournamentId?`, `competitionId?`, `seasonId?`, `status?`；**无分页**；含 `liveStatusSyncHint`（见第二期规范 §4.5） |
| GET | `/matches/:matchId/detail-v2` | 可选 Bearer；**`match-detail-v2`**（与 **`GET /api/v2/matches/:matchId/detail`** 同体）；响应头含 `Deprecation`，新接入用 **§2.5.2** v2 路径 |
| GET | `/matches/:id/intel` | 可选 Bearer；**`MatchIntelResponse`**；**Deprecated（90 天）** `deprecated: true`，无 `predictionMarkets`/OLS；迁移 **§2.5.1** |
| GET | `/matches/:id/analysis-preview` | 可选 Bearer；**analysis-preview-v1**；**Deprecated（90 天）**；见 **§2.7** |
| GET | `/matches/:id/pre-match` | 可选 Bearer；**match-phase-v1**；**Deprecated（90 天）**；见 **§2.4** |
| GET | `/matches/:id/live` | 可选 Bearer；赛中页 **`match-phase-v1`**，`facts.live` 为 `match-live-v1`（**非 Deprecated**） |
| GET | `/matches/:id/post-match` | 可选 Bearer；赛后页，仅 **`status=FINISHED`**；**Deprecated（90 天）** |
| GET | `/matches/:id/live/stream` | **SSE** `text/event-stream`；Query `lastSeq?`；限流约 **30 次/分钟/IP**；网关需 `X-Accel-Buffering: no`、读超时 **≥120s** |
| GET | `/matches/:id/odds-snapshots` | 赔率快照 T24/T1/LIVE + disclaimer；**非投注建议** |
| GET | `/matches/:id/injuries` | 本场伤停 BFF（勿浏览器直连 `/football-feed/injuries`）；需 `externalId` 为 `af-f-*` |
| GET | `/matches/:id` | 可选 Bearer；详情与解锁态 |
| GET | `/leagues/:code/injuries` | `season?`, `teamId?`（AF 联赛伤停，服务端代理） |
| GET | `/rankings/players` | `competitionId?` 或 `code?`+`season?`, `metric?`, `limit?`, **`source?`**（`auto` \| `db` \| `api_football`，默认 `auto`）；`metric=powerRating` → **410**；项含 `rank`, `playerId`, 嵌套 `player` |
| GET | `/rankings/leaderboards` | `codes?`（默认 `PL,PD,SA,BL1,FL1,CL,EL,UECL,WC`）、`season?`（默认 **2025**）、`wcSeason?`（默认 **2026**，仅 `code=WC`）；只读 DB 积分榜+射手榜聚合，见 **§2.5.3** |
| GET | `/players/:id/summary` | 球员公开摘要；含 `marketValue`、`seasonStats`、`radarHints` |
| GET | `/teams/:teamId/upcoming-schedule` | `days?`（默认 30）；未来赛程 + `difficulty` / `difficultyScore` |
| GET | `/insights/upset-signals` | `from?`, `to?`, `limit?`, `minUpset?`（ISO 时间；默认近/后各约 14 天） |
| GET | `/insights/champion-prediction` | `competitionId`（如 `seed-comp-wc`）；启发式冠军预测，`available: false` 时含 `reason` |
| GET | `/cms/tools` | 工具入口配置（内置默认列表） |
| GET | `/cms/materials` | `category?` |
| GET | `/cms/reports` | `category?`, `type?`（`match` \| `season` \| `team` \| `player`）；报告发现页样例列表（`config/cms-reports.json`） |
| GET | `/cms/membership-plans` | 与 `GET /orders/pricing` 同 payload（含 **`features`** 权益表） |
| GET | `/orders/pricing` | **V2 价目** + **`features: { free, pro }`**（`config/pricing-features.json` 或 `PRICING_FEATURES_JSON`） |
| GET | `/auth/captcha` | `provider: svg` → `{ captchaId, imageBase64 }`；`provider: geetest` → 极验 init 字段 |
| POST | `/auth/register` | 至少 `email`/`username` 之一 + `password` + `captchaId`；SVG 用 `captchaCode`，Geetest 用 `lotNumber`/`captchaOutput`/`passToken`/`genTime` |
| POST | `/auth/login` | `{ "identifier", "password" }`（邮箱或用户名） |
| GET | `/auth/wechat/web/authorize` | Web 扫码；`?json=1` 返回 `{ url, state }`，否则 302 |
| GET | `/auth/wechat/web/callback` | 微信 OAuth 回调 → 302 到 `AUTH_WEB_FRONTEND_CALLBACK?accessToken=` |
| POST | `/auth/apple/login` | `{ "idToken" }` |
| POST | `/auth/bind-apple` | 已登录绑定 Apple |
| GET | `/auth/google/authorize` | Google Web 扫码；`?json=1` 返回 `{ url, state }` |
| GET | `/auth/google/callback` | Google OAuth 回调 → 302 带 `accessToken` |
| POST | `/auth/google/login` | Google `id_token` 登录 |
| POST | `/auth/bind-google` | 已登录绑定 Google |
| POST | `/auth/wechat-login` | 小程序 `{ "code", "nickname?", "avatarUrl?" }` |
| POST | `/auth/phone/send-code` | `{ "phone", "purpose?" }`：`bind` \| `reset_password`（**无 register**） |
| POST | `/auth/phone/register` | **[默认关闭]** 手机验证码注册 |
| POST | `/auth/phone/login-password` | `{ "phone", "password" }`（历史账号） |
| POST | `/auth/phone/login-otp` | **[默认关闭]** 手机验证码登录 |
| POST | `/auth/password/forgot-phone` | 找回密码发码 |
| POST | `/auth/password/reset-phone` | `{ "phone", "code", "newPassword" }` |
| POST | `/wxpay/notify` | 微信回调；原始 body 验签 |
| POST | `/feedback` | `{ "message", "contact?" }`；可选 Bearer 写入 `userId`（匿名亦可） |
| GET | `/football-feed/*` | 上游 api-sports 代理；Query 见 **§4** 与 Swagger |

### 2.2 需 JWT（登录用户）

| METHOD | 路径 | 说明 |
|--------|------|------|
| GET | `/matches/:id/unlock-status` | 当前用户本场是否视为已解锁 |
| POST | `/orders/matches/:matchId/create` | 单场解锁；**FINISHED** 直接 `isUnlocked`；否则须 **PUBLISHED** 报告，否则 **400** `报告尚未发布，暂不可购买解锁`；等价 **`POST /api/v2/matches/:matchId/unlock`**（需已绑手机，见 **§2.3**） |
| POST | `/orders/membership/create` | Body：`{ "plan": "month" \| "quarter" \| "year" }` |
| POST | `/orders/social-poster/matches/:matchId/create` | 社交海报付费订单 |
| GET | `/orders/:orderNo` | 当前用户订单详情 |
| POST | `/matches/:id/social-poster/generate` | 海报出图；Body 可选 `{ "customElements?" }`；响应含 `status`、`posterImageUrl`、`billing`、`orderNo?`（见 **§2.3**） |
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
| GET | `/me/social-posters` | `cursor?`（上一页最后 `orderNo`）, `limit?`；列表项含 `imageUrl`、`template`、`matchId` |
| GET | `/me/report-unlocks` | 已购报告列表；含 `title`、`unlockedAt`、`reportStatus`、`freeSummary`（非全文） |
| GET | `/me/orders` | `product?`（`OrderProduct` 枚举名）, `cursor?`, `limit?` |
| GET | `/me/browse-history` | `cursor?`（上一项 `id`）, `limit?`；跨设备浏览记录 |
| POST | `/me/browse-history` | Body：`type`（`analysis`\|`poster`\|`view`）, `matchId?`, `title?`, `sub?`, `visitedAt?`；同场同类型 upsert |
| GET | `/me/notifications` | `cursor?`, `limit?`, `unreadOnly?`；**消息中心**（非开球提醒） |
| PATCH | `/me/notifications/:id` | Body：`{ "read": true }` |
| POST | `/me/notifications/read-all` | 全部标已读 |

### 2.3 关键业务前置（摘要）

- **统一包装**：前端 `apiClient` 应解析 **`response.data`**（`success === true` 时）。  
- **Web 登录（推荐）**：`GET /auth/wechat/web/authorize` → 扫码 → 回调带 `accessToken`；或 `GET /auth/captcha` + `POST /auth/register` / `POST /auth/login`。详见 **[登录注册对接说明.md](./登录注册对接说明.md)**。  
- **小程序**：`POST /auth/wechat-login`（`wx.login` code）。  
- **短信 OTP**：仅 **`bind`**、**`reset_password`**；默认 **关闭** `phone/register` 与 `phone/login-otp`（`AUTH_DISABLE_PHONE_*`）。联调 `ENABLE_SMS_OTP_DEBUG=true` 时 `send-code` 可带 **`devCode`**（**禁止生产**）。  
- **微信支付 JSAPI**（小程序）：下单需用户 **`openid` 非空**；手机注册用户需先 **`POST /auth/bind-wechat`**。Web 若仅手机账号，支付链路以产品方案为准。  
- **手机门禁**（`AUTH_REQUIRE_VERIFIED_PHONE=true`）：`POST/PATCH/DELETE /me/*` 与 `POST /orders/*/create` 需 **`phoneVerified`**；403 体 `code: PHONE_VERIFICATION_REQUIRED` → 引导 `POST /auth/bind-phone`。与 openid 门禁**同时**生效。  
- **报告解锁**（`OrdersService.createForMatch`）：  
  1. `match.status === FINISHED` → `{ isUnlocked: true, order: null, payParams: null, hint: '已完赛场次对注册用户免费开放情报，无需购买解锁' }`。  
  2. 否则须存在 `AiReport.status === PUBLISHED`，否则 **400** `报告尚未发布，暂不可购买解锁`。  
  3. 已解锁 / Pro / 复用待支付单等见 `OrdersService`。  
  **`POST /api/v2/matches/:matchId/unlock`** 行为相同，且受 **`@RequiresVerifiedPhone()`**（`AUTH_REQUIRE_VERIFIED_PHONE=true` 时须 `phoneVerified`）。  
  已购列表：**`GET /me/report-unlocks`**（无 `/me/unlocks`）。  
- **可选 Bearer 的读接口**：`intel`、`detail`、`analysis-preview`、**三页合同**（`pre-match` / `live` / `post-match`）均 `@Public()` 但读取可选 **`Authorization`**，解锁逻辑与 `UnlockService` 一致；带 Bearer 时部分 `matches` GET 可能 `Cache-Control: private, no-store` 且 `Vary: Authorization`。  
- **深度分析 C 端**：采用 **`GET /matches/:id/analysis-preview`**（方案 B 聚合）；**不要**调用 **§3.6** Admin 的 `GET /matches/:id/tactics` 等。  
- **比赛提醒**：`GET/POST/PATCH/DELETE /me/match-reminders` 为 **开赛前赛程提醒** CRUD；与 **`/me/notifications` 消息中心** 勿混用。  
- **通知收件箱**：支付成功、海报生成成功等由服务端写入 `UserNotification`；前端只读列表 + 标已读。  
- **Web 支付轮询**：`POST /orders/.../create` 返回 `payParams`（微信 JSAPI，需 `openid`）后，建议轮询 **`GET /orders/:orderNo`** 直至 `status=PAID`，再刷新 **`GET /matches/:id/unlock-status`**。  
- **SSE**：`GET /matches/:id/live/stream` 为 **`@Public()`** 只读；浏览器 `EventSource` 无法带 `Authorization`；重连用 `?lastSeq=`；事件形状见 **§2.8**。  
- **数据库**：需执行 migration **`20260513140000_web_me_cms_feedback`** 与 **`20260516120000_web_browse_history_notifications`**（`UserBrowseHistory`、`UserNotification` 等）。

### 2.4 三页合同（`match-phase-v1`）

赛前 / 赛中 / 赛后独立页优先使用下列接口；**付费多模块全文**仍用 **`GET /matches/:id/intel`**。各 phase 响应含 **`meta.recommendedPollSec`**（建议：赛前 **30s**、赛中 **10s**、赛后 **60s**）及 **`meta.links.intel`**。

| 路径 | 适用状态 | 说明 |
|------|----------|------|
| `GET /matches/:id/pre-match` | 赛前 | `facts`：`teamSnapshots`、`homeForm`/`awayForm`、`h2h`、`homeInjuries`/`awayInjuries`；`model`（预测/赔率 T24·T1）；`narrative`（PRE_MATCH 报告） |
| `GET /matches/:id/live` | 赛中 | `facts.live` 为 **`match-live-v1`**（比分、事件、统计、`keyMetricsAvailability`、`metricLabels`、文字直播等） |
| `GET /matches/:id/post-match` | **`FINISHED`** | 终场事实、`facts.events[]`（与 `eventsCount` 一致）、`model.grading`、`narrative` 赛后复盘（含可选 `structuredSummary`） |
| `GET /matches/:id/live/stream` | 赛中 | SSE：见 **§2.8** |

**与列表轮询**：列表/卡片仍可用 **`GET /matches`**、**`GET /matches/:id`** 刷新比分；`status` 来自库表，非请求瞬间上游查询（Cron 写库，见 **`开发文档.md`** / 第二期 §4.5）。赛中事实增量依赖 **`ENABLE_AF_LIVE_FACTS_CRON`** 等环境开关。

**赔率**：赛前/赛中展示盘口快照可读 **`GET /matches/:id/odds-snapshots`**（持久化 `MatchOddsSnapshot`）；勿将 `football-feed/odds` 代理当作唯一数据源。

#### narrative 与报告状态

| 观众 | `narrative` 选用规则 | 说明 |
|------|----------------------|------|
| 游客 / 普通登录用户 | **仅** `ReportStatus.PUBLISHED` | `pickPreMatchReport` / `pickTypedReport`（`match-report-picker.util.ts`） |
| `role=ADMIN` 的 JWT | `DRAFT` → `REVIEW` → `PUBLISHED` | `meta.isAdminViewer: true`；后台预览，**勿**作 C 端线上默认 |
| 未解锁 | `freeSummary` 截断（约 280 字）+ 可选 teaser | 全文需解锁或完赛免费（`FINISHED_FREE_ALL`） |
| 已解锁 | 含 `structuredSummary`（赛后）等 | 与 `resolveIntelUnlocked` 一致 |

- **`pre-match` / `post-match`**：响应含 `deprecated: true`、`deprecatedMessage`（迁移 detail-v2）；`model.predictionMarkets` 恒 **`null`**；原 **`ui`**（match-detail-pre-unlocked 合成块）已下线。  
- **`live`**：**无** `deprecated`；赛中仍可用 REST + 可选 SSE。

### 2.5.1 `GET /matches/:matchId/detail-v2` — 契约 `match-detail-v2`（v2 主接口）

| 项 | 说明 |
|----|------|
| 主路径 | **`GET /api/v2/matches/:matchId/detail`**（推荐）；`GET /matches/:matchId/detail-v2` 同体 + Deprecation 头 |
| 鉴权 | `@Public()`，可选 Bearer（影响 `access` / `paidModules.*.locked`） |
| 绿库 | `externalId` 为 `af-f-*` 时访问可能触发服务端 `syncOnUserView`；`availability` 反映 AF bundle 覆盖 |
| 免费 | `basic`、`freeModules.injuries`（含 type/reason）、`lineupsStatus` / `lineups` |
| 付费 | `paidModules.predictions`（AF 整包）、`odds`、`tacticalScript`、`playerIntelligence`、`aiReports` |
| 下线 | `predictionMarkets`、OLS 战力、`match-detail-pre-unlocked` 合成 UI；`intel.paid.dashboard.detail.predictionMarkets` 为 `null` |

**Redis 缓存 tier**（键 `match-detail-v2:{matchId}:{tier}`，`PaywallService.cacheTier`）：

| tier | 条件 |
|------|------|
| `guest` | 未登录 |
| `free` | 已登录未解锁 |
| `unlocked` | 已解锁或会员等 |
| `admin` | `role=ADMIN` |

**禁止** guest/free 命中 unlocked 缓存。

**`paidModules.aiReports`**（`MatchDetailBffService`）：

- 查询仅 `reportType=PRE_MATCH` 且 `status=PUBLISHED`（最多 3 条）。
- `hasData: true`：存在已发布赛前报告；**不代表**用户已解锁。
- `data`：仅当 `access.permissions.aiReports === true` 时为 `[{ id, reportType, freeSummary, source: 'deepseek' }]`；否则 **`data: null`**（即使 `hasData: true`）。
- 运维仅有 DRAFT/REVIEW 时，C 端 `hasData: false`，且无法下单（见 **§2.3**）。

**paywall**：`unlockType`、`unlockPrice`、`price`、`currency`、`display`、`buttonText`、`benefits[]`、`cta`。

**环境变量（v2）**：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ENABLE_AF_RAW_BUNDLE` | `true` | AF 绿库 bundle 读路径 |
| `ENABLE_OLS` | `false` | OLS 战力（已下线） |
| `ENABLE_PREDICTION_MARKETS` | `false` | 合成预测市场块 |
| `ENABLE_AF_FACTS_DUAL_WRITE` | `false` | 事实双写 |
| `ENABLE_PIPELINE_LEGACY_PREDICTION` | `false` | 旧预测管线 |
| `FINISHED_FREE_ALL` | `true` | 完赛登录用户视为已解锁 |

**Rankings**：`GET /rankings/players?metric=powerRating` → **410**，请用 `goals` / `assists`。

**Deprecated（90 天）**：`intel`、`pre-match`、`post-match`、`analysis-preview` 响应含 `deprecated: true` + `deprecatedMessage`；**不含** `live` / `live/stream`。

**aiReports 节选**：

未解锁、已有 PUBLISHED 报告：

```json
"paidModules": {
  "aiReports": {
    "locked": true,
    "hasData": true,
    "status": "present",
    "title": "AI 深度分析",
    "data": null
  }
}
```

已解锁且已发布：

```json
"paidModules": {
  "aiReports": {
    "locked": false,
    "hasData": true,
    "data": [
      { "id": "...", "reportType": "PRE_MATCH", "freeSummary": "…", "source": "deepseek" }
    ]
  }
}
```

无 PUBLISHED 报告：`hasData: false`，`status: "missing"`，`data: null`。

### 2.5.2 API v2 前缀路由

全局前缀 **`/api/v2`**（与根路径 v1 并存）。下列为 C 端主链接入路径（源码：`src/api-v2/*`）。

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/v2/matches/:matchId/detail` | 公开 + 可选 Bearer | **`match-detail-v2`**，详情主接口 |
| GET | `/api/v2/matches/:matchId/access` | 同上 | **`match-access-v1`**，首屏轻量权限 |
| POST | `/api/v2/matches/:matchId/unlock` | JWT + 已绑手机 | 等同 `POST /orders/matches/:matchId/create` |
| GET | `/api/v2/leagues/:code/standings` | 公开 | `season?`（默认 2025）；读 `LeagueAfCache`，未 sync → **404** |
| GET | `/api/v2/leagues/:code/topscorers` | 公开 | 射手榜 |
| GET | `/api/v2/leagues/:code/topassists` | 公开 | 助攻榜 |
| GET | `/api/v2/leagues/:code/topyellowcards` | 公开 | 黄牌榜 |
| GET | `/api/v2/leagues/:code/topredcards` | 公开 | 红牌榜 |
| GET | `/api/v2/leagues/:code/rounds` | 公开 | 轮次 |
| GET | `/api/v2/teams/:teamId/transfers` | 公开 | `season?`；B4，**不进 detail** |
| GET | `/api/v2/teams/:teamId/trophies` | 公开 | 球队荣誉 |
| GET | `/api/v2/players/:playerId/trophies` | 公开 | 球员荣誉 |
| GET | `/api/v2/players/:playerId/sidelined` | 公开 | 缺阵史 |

### 2.5.3 `GET /rankings/leaderboards` — 榜单中心

| 项 | 说明 |
|----|------|
| 鉴权 | `@Public()` |
| 数据源 | **只读 DB**（`CompetitionStanding` + 物化射手榜）；空表时 `groups`/`items` 可为 `[]`，前端需空态 |
| Query | `codes?` 逗号/空格分隔，默认 `PL,PD,SA,BL1,FL1,CL,EL,UECL,WC`；`season?` 默认 **2025**；`wcSeason?` 默认 **2026**（仅 `code=WC` 的 `season` 字段用 `wcSeason`） |

**响应顶层**：`season`、`wcSeason`、`leagues[]`。每项含 `code`、`season`、`competitionId`、`standings.groups[]`（`groupName`、`rows`）、`topscorers`（`metric: "goals"`、`items`）。

```json
{
  "season": 2025,
  "wcSeason": 2026,
  "leagues": [
    {
      "code": "PL",
      "season": 2025,
      "competitionId": "seed-comp-pl",
      "standings": { "groups": [{ "groupName": "", "rows": [] }] },
      "topscorers": { "metric": "goals", "items": [] }
    }
  ]
}
```

**选用建议**：榜单中心多联赛 Tab 用本接口；单场/单联赛详情仍可用 `GET /leagues/standings`、`GET /api/v2/leagues/:code/standings`。

### 2.5 Web 全量接入清单

> 对照 **`缺少的接口-web前端.md`**；下列为 **Web 前端** 建议对接顺序（后端路由已具备，除非注明「待前端接」）。

#### P0 — 账号与交易主链（后端已有，替换 mock）

| 页面/能力 | 方法 | 路径 |
|-----------|------|------|
| 登录/注册 | GET/POST | `/auth/captcha`、`/auth/register`、`/auth/login`、`/auth/wechat/web/*` |
| 小程序登录 | POST | `/auth/wechat-login` |
| 当前用户 | GET | `/auth/me`（JWT） |
| 单场是否已解锁 | GET | `/matches/:id/unlock-status` |
| 单场报告下单 | POST | `/orders/matches/:matchId/create` |
| 会员下单 | POST | `/orders/membership/create` |
| 海报出图 | POST | `/matches/:id/social-poster/generate` |
| 订单详情 | GET | `/orders/:orderNo` |
| 价目 | GET | `/orders/pricing`（公开） |

#### P1 — 用户域与世界杯

| 页面/能力 | 方法 | 路径 |
|-----------|------|------|
| 收藏 | GET/POST/DELETE | `/me/favorite-matches*` |
| 提醒 | GET/POST/PATCH/DELETE | `/me/match-reminders*` |
| 设置 | GET/PATCH | `/me/preferences`（`followedLeagues[]`、`followedCompetitionIds[]`，GET 空库补全 `[]`） |
| 海报历史 | GET | `/me/social-posters` 或 `/me/orders?product=SOCIAL_POSTER` |
| 已购报告 | GET | `/me/report-unlocks`（含 `title`/`freeSummary`） |
| 浏览历史 | GET/POST | `/me/browse-history` |
| 通知中心 | GET/PATCH/POST | `/me/notifications*` |
| 积分榜 | GET | `/leagues/standings?codes=PL,PD,...&season=2025`（**BFF，推荐**）、`/leagues/:code/standings`、`/competitions/:id/standings`（仅已完赛聚合） |
| 球员榜 | GET | `/rankings/players`（含 `avatarUrl`、`marketValue`、`fantasyPrice`） |
| 单队赛程 | GET | `/competitions/:id/worldcup2026-schedule/:teamId` |
| 球队关注 | GET/POST/DELETE | `/worldcup2026/me/team-follows*` |

#### P2 — 榜单与情报增强

| 页面/能力 | 方法 | 路径 |
|-----------|------|------|
| 比赛详情 v2 | GET | `/api/v2/matches/:id/detail`、 `/api/v2/matches/:id/access` |
| 榜单中心 | GET | `/rankings/leaderboards?season=2025&wcSeason=2026` |
| 球员摘要 | GET | `/players/:id/summary`（含 `marketValue`、`marketValueCurrency`） |
| 冷门信号 | GET | `/insights/upset-signals` |
| 分析页只读 | GET | `/matches/:id/analysis-preview`（**Deprecated**，见 §2.7） |
| 三页合同 | GET | `.../live`（主链）、`.../pre-match`/`post-match`（Deprecated）+ SSE `.../live/stream` |

#### P3 — 运营与其它

| 页面/能力 | 方法 | 路径 |
|-----------|------|------|
| 侧边栏联赛计数 | GET | `/competitions/match-counts` |
| 赛程难度 | GET | `/teams/:teamId/upcoming-schedule?days=30` |
| 会员权益表 | GET | `/orders/pricing` 或 `/cms/membership-plans`（`features`） |
| 世界杯冠军预测 | GET | `/insights/champion-prediction?competitionId=` |
| 伤停 BFF | GET | `/matches/:id/injuries`、`/leagues/:code/injuries` |
| 工具入口 | GET | `/cms/tools` |
| 创作者素材 | GET | `/cms/materials` |
| 报告发现样例 | GET | `/cms/reports` |
| 反馈 | POST | `/feedback` |
| 上游只读（慎用配额） | GET | `/football-feed/*`（见 **§4**；生产建议 BFF/服务端代理，勿在前端暴露 Key） |

**联调自检（前端）**

- [ ] 所有请求解析 `{ success, data }`；错误读 `message` / HTTP 状态码  
- [ ] `matchId` 使用接口返回的 **cuid**，勿自造 ID  
- [ ] 公开只读与 JWT 接口混用时，按需带 `Authorization`  
- [ ] 生产环境确认 migration 已 `deploy`  
- [ ] 与 Swagger `/docs` 或本文档 diff 无遗漏（尤其 **§2.1**、`/api/v2`、`leaderboards`）
- [ ] 历史/通知页已接 **`/me/browse-history`**、**`/me/notifications`**（勿与 `match-reminders` 混用）
- [ ] 测试场有 **PUBLISHED** AI 报告；未解锁时 `paidModules.aiReports.data === null`
- [ ] 新详情页用 **`/api/v2/.../detail`**，勿以 Deprecated 的 `intel`/`pre-match` 作主接口

### 2.7 `GET /matches/:id/analysis-preview` — 契约 `analysis-preview-v1`

**Deprecated（90 天）**：响应含 `deprecated: true`、`deprecatedMessage`（迁移 **`GET /api/v2/matches/:id/detail`**）。

可选 Bearer；`isUnlocked` 与 `GET /matches/:id/intel` 一致。付费长文仍仅走 detail-v2 或三页 **`narrative`**。

**顶层字段**：`meta`, `matchId`, `status`, `kickoffTime`, `isUnlocked`, `prediction`, `tactics`, `fantasy`, `headToHead`, `head_to_head`, `playerIntelligence`, `playerIntelligenceCount`, 可选 **`summary`**。

**`playerIntelligence.items[]`**：`player.avatarUrl` 与 **`player.photoUrl`** 同内容（别名）。

**未解锁 teaser 示例**（节选）：

```json
{
  "meta": {
    "contractVersion": "analysis-preview-v1",
    "fieldBoundary": "Full modules: GET /matches/:id/intel; phase: pre-match/live/post-match"
  },
  "isUnlocked": false,
  "tactics": {
    "count": 3,
    "items": [{ "id": "...", "title": "高位逼抢", "scenarioType": "PRESS" }]
  },
  "fantasy": { "id": "...", "locked": true },
  "headToHead": { "id": "...", "homeWins": 2, "draws": 1, "awayWins": 0, "locked": true },
  "head_to_head": { "id": "...", "homeWins": 2, "draws": 1, "awayWins": 0, "locked": true },
  "playerIntelligence": {
    "count": 8,
    "items": [
      {
        "id": "...",
        "statusTag": "START",
        "riskLevel": "LOW",
        "locked": true,
        "player": { "id": "...", "nameCn": "球员甲", "position": "FW" }
      }
    ]
  }
}
```

**已解锁**：`tactics.items` 含 `probability`；`fantasy` 含 `captainRecommendation`；`playerIntelligence.items` 含 `aiSummary` 等；`headToHead` 含 `summary`（无 `locked`）。

### 2.6 `GET /matches/:id/intel` — `teams` 战力字段（与 OLS 预测一致）

业务体为 **`MatchIntelResponse`**（见 `src/matches/match-intel.types.ts` / `buildMatchIntelResponse`）。`data.teams.home` / `data.teams.away` 中与「战力」相关的两个数**含义不同**，前端展示时请区分文案，勿混用：

| 字段 | 含义 | 数据来源 |
|------|------|----------|
| **`powerRating`** | **本场 OLS 基础 TPR**（与胜率模型分项一致） | 优先读取本场 `MatchPrediction.factorBreakdown.ols.homeBaseTpr` / `awayBaseTpr`；若预测缺失或因子中无 `ols` 分项，则回退 **`Team.powerRating`**（可能来自他场同步，仅兜底）。 |
| **`matchPower`** | **本场单场修正战力**（主场优势、伤病、疲劳等叠加后的单场值） | 本场 `MatchPrediction.homeMatchPower` / `awayMatchPower`；无预测时为 `null`。 |

与 **`freeLayer.predictionPreview.homeMatchPower` / `awayMatchPower`** 同源；未解锁时 preview 仍可展示概率与单场战力，`teams.matchPower` 与之一致便于同一卡片内对齐。

若 OLS 同步失败，`factorBreakdown.ols` 可能为 `null`，此时 `teams.*.powerRating` 仅依赖 `Team` 表兜底。

### 2.8 `GET /matches/:id/live/stream` — SSE 事件

`Content-Type: text/event-stream`；每条 `data` 为 JSON 字符串（非统一 `{ success, data }` 包装）。

| `type` | 时机 | `data` 形状 |
|--------|------|-------------|
| **`snapshot`** | 连接后首包 | 与 **`GET /matches/:id/live`** 的 `facts.live` 同源（完整 **`match-live-v1`**） |
| **`live_patch`** | Redis 推送有新 seq | `{ "matchId", "seq", "at" }`（ISO 时间）；**不含**增量字段，客户端收到后应 **再拉** `GET .../live` 或复用 snapshot 合并策略 |

Query **`lastSeq?`**：忽略 `seq <= lastSeq` 的 patch，用于断线重连。

**与 REST 对齐**：`live_patch` 仅作「有更新」信号；展示用字段以 `match-live-v1` 为准（`events`, `commentary`, `teamStats`, `keyMetrics` 等）。赛中数据依赖 Cron **`ENABLE_AF_LIVE_FACTS_CRON`** 写入 `MatchFacts`。

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

**生产（`NODE_ENV=production`）**：默认 **`ENABLE_FOOTBALL_FEED_PUBLIC=false`**，全部路由 **403**，文案提示改用 BFF（`/matches`、`/leagues/standings`、`/rankings/players?source=db` 等）。上游调用受 **`API_FOOTBALL_DAILY_QUOTA`** + Redis 日计数约束，仅 Cron/Admin 写入。

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

1. **`CompetitionsController`**：`worldcup2026-*`、`standings` 路由须写在 **`GET /competitions/:id`** 之前（源码已满足）。  
2. **多个 `@Controller('matches')`**：`MatchesController`、`MatchPhaseController`、`MatchLiveController`、`SocialPosterController` 等同前缀。C 端须将 **字面量子路径**（`intel`、`analysis-preview`、`pre-match`、`live`、`post-match`、`live/stream`、`odds-snapshots`、`unlock-status`、`social-poster/generate` 等）注册在泛化 **`GET /matches/:id`** 之前（源码已满足）。  
3. **C 端海报**：**`POST /matches/:id/social-poster/generate`**（JWT，非 `@Public()`）。  
4. **Admin 根路径接口**：如 **`POST /matches/:id/generate-prediction`**、**`POST /matches/:id/sync-live-facts`** 与 C 端 **`GET /matches/:id`** 共用前缀但方法/权限不同，无 HTTP 方法冲突。  
5. **SSE**：**`GET /matches/:id/live/stream`** 经 `@Sse` 返回事件流，非 JSON 包装；勿用普通 `fetch` 当 REST 解析。

---

## 7. 文档维护

- 接口增删改后，请同步更新本文档；**非 production** 或 **`ENABLE_SWAGGER_DOCS=true`** 时同步 **`/docs`** Swagger 注解。  
- **C 端行为**（detail-v2、AI 发布、Deprecated、榜单、下单前置）须同步 **§2.4**、**§2.5.1–2.5.3** 及分端文档 [Web](./Web前端对接文档-完整版.md)、[小程序](./小程序前端对接文档-完整版.md) §5–§7、§9、§12。  
- **Web 联调进度**同步 **`缺少的接口-web前端.md`** §5 勾选。  
- 环境变量、Cron、Prisma 模型以 **`开发文档.md`** 与 **`prisma/schema.prisma`** 为准。  
- 产品级说明、抽检清单可与 **`第二期前端对接规范文档.md`**、**`README.md`**、**`测试文档-完整版.md`** 交叉引用；生产无 `/docs` 时**以源码与本文档为准**。
