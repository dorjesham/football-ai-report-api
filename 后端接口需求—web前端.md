# Web 前端 — 后端接口需求说明

> **文档目的**：汇总 Web 端仍依赖本地/mock/静态数据的模块，以及「已有接口但契约不足」的增强项，便于与后端、产品对齐排期。  
> **依据**：[API接口对接文档-完整版.md](./API接口对接文档-完整版.md)（2026-05-16）、[缺少的接口-web前端.md](./缺少的接口-web前端.md)、[Web前端对接回复.md](./Web前端对接回复.md)。  
> **后端状态（2026-05-16）**：Batch 1 + §2 已落地，见对接回复文档；本文 §2 需求项后端已完成，待 **前端对接**。
> **原则**：C 端不调用 Admin 根路径读接口（如 `GET /matches/:id/tactics`）；`matchId` / `teamId` 一律使用库表 **cuid**；响应统一 `{ success, data, message }`。

---

## 1. 总览

### 1.1 状态分类

| 状态 | 含义 |
|------|------|
| **已对接** | 前端已调用文档中的 C 端路径，仅联调/字段微调 |
| **部分对接** | 有接口但字段或场景不足以替换全部 UI |
| **缺失** | 文档无 C 端路径，或前端未接且产品需要 |
| **产品待定** | 需产品确认是否做 Web，避免后端空做 |

### 1.2 优先级建议

| 优先级 | 范围 | 说明 |
|--------|------|------|
| **P0** | 契约补全、支付与订单闭环 | 影响交易与已购内容展示 |
| **P1** | 用户域列表、分析页数据对齐 | 跨设备体验、减少 mock |
| **P2** | 发现页/CMS、导航与榜单 | 体验增强 |
| **P3** | 架构类（BFF、SSE 鉴权） | 与安全/运维相关 |

---

## 2. 完全缺失或仅有本地占位（需新增 C 端 API）

> **2026-05-16 后端已实现** §2.1–2.3，详见 [Web前端对接回复.md](./Web前端对接回复.md)。以下保留需求原文供验收对照。

### 2.1 浏览历史 — `HistoryPage` — **后端已完成**

| 项 | 内容 |
|----|------|
| **前端** | [`src/pages/HistoryPage.tsx`](src/pages/HistoryPage.tsx)、[`src/lib/localAppState.ts`](src/lib/localAppState.ts)（`offside_history_v1`） |
| **现状** | 进入分析页时 `pushHistory` 写入本机；换设备/清缓存丢失 |
| **文档** | `GET/POST /me/browse-history`（已实现） |
| **需求** | 用户浏览记录跨端同步 |

**建议接口**

```
GET  /me/browse-history?cursor=&limit=
POST /me/browse-history
     Body: { "type": "analysis" | "poster" | "view", "matchId"?: string, "title"?: string, "visitedAt"?: ISO8601 }
```

**`data` 列表项建议字段**

- `id`, `type`, `matchId?`, `title`, `sub?`, `visitedAt`
- 可选嵌套 `match` 摘要（与 `favorite-matches` 一致）

**验收**

- 登录用户在 A 设备浏览分析页，B 设备历史列表可见（延迟可接受秒级）
- 未登录：产品确认是否继续仅本地（当前行为）

---

### 2.2 通知收件箱 — `NotificationsPage` — **后端已完成**

| 项 | 内容 |
|----|------|
| **前端** | [`src/pages/NotificationsPage.tsx`](src/pages/NotificationsPage.tsx)、`pushNotification`（下单/海报等触发） |
| **现状** | 全部为 **localStorage** 模拟「系统通知」 |
| **勿混淆** | **`/me/match-reminders`** 仅为「开赛前 N 分钟」赛程提醒，**不是**消息中心 |
| **后端** | `GET/PATCH /me/notifications*`；支付/海报成功由服务端写入 |

**建议接口**

```
GET    /me/notifications?cursor=&limit=&unreadOnly=true|false
PATCH  /me/notifications/:id          # { "read": true }
POST   /me/notifications/read-all     # 可选
```

**列表项建议字段**

- `id`, `title`, `desc`, `icon?`, `color?`, `read`, `createdAt`
- 可选 `link`（如 `/analysis/:matchId`）、`orderNo?`

**产品需确认**

- Web 是否要做「通知中心」，还是仅微信模板/Cron 推送？
- 若不做：前端继续本地占位并标注文案（已实现说明）

---

### 2.3 报告发现页 / 专题样例 — `ReportPage` 顶部 — **后端已完成（内置样例）**

| 项 | 内容 |
|----|------|
| **前端** | [`src/pages/ReportPage.tsx`](src/pages/ReportPage.tsx) 内静态 `reports[]` |
| **现状** | 运营演示用样例（标题、摘要、preview 段落），**非**接口数据 |
| **文档** | `GET /cms/reports`（内置配置，非 Admin CRUD） |

**建议接口（二选一）**

```
GET /cms/reports?category=&type=match|season|team|player
GET /insights/reports?...
```

**列表项建议字段**

- `id`, `title`, `summary`, `type`, `league`, `tags[]`, `pages?`, `confidence?`, `isPremium`, `publishedAt`
- 可选 `preview[]`（`section` + `detail`），或仅摘要、详情跳转 `matchId`

**产品需确认**

- 顶部是否长期保留静态样例 + 底部「我的已购」？
- 还是全部改为 CMS/已发布报告列表？

---

## 3. 已有接口但需增强（非「从零造接口」）

### 3.1 已购报告列表 — `GET /me/report-unlocks` — **后端已增强（2026-05-16）**

| 项 | 内容 |
|----|------|
| **前端** | [`ReportPage`](src/pages/ReportPage.tsx) 底部、[`ProfilePage`](src/pages/ProfilePage.tsx) 计数 |
| **已接** | `GET /me/report-unlocks` |
| **缺口** | ~~列表项缺少报告标题/摘要~~ → 已提供 `title`、`unlockedAt`、`reportStatus`、`freeSummary` |

**建议在现有 `data[]` 每项增加**

- `match` 摘要：`homeTeam` / `awayTeam` / `competition` / `kickoffTime`
- `unlockedAt`, `reportStatus?`（与 Admin 发布状态对齐）
- 可选 `summary` / `freeSummary`（未解锁可脱敏）
- **不要**在列表接口塞全文；全文仍走单场 `GET /matches/:id/intel`（Bearer）或 `post-match` 的 `narrative`

**关联只读接口（已有，供跳转后使用）**

- `GET /matches/:id/intel` — 付费多模块全文
- `GET /matches/:id/post-match` — 赛后 `narrative` / `structuredSummary`
- `GET /matches/:id/pre-match` — 赛前 `narrative`

---

### 3.2 分析页扩展区 — `GET /matches/:id/analysis-preview` — **后端已增强（analysis-preview-v1）**

| 项 | 内容 |
|----|------|
| **前端** | [`MatchDetailSupplement.tsx`](src/components/matchAnalysis/MatchDetailSupplement.tsx)、[`AnalysisPreviewFromApi.tsx`](src/components/matchAnalysis/AnalysisPreviewFromApi.tsx) |
| **已接** | `analysis-preview`；有数据时展示 API 块 |
| **缺口** | 前端需对接 **analysis-preview-v1**（`playerIntelligence.items`、`head_to_head`）；赛中块用 `live` / SSE |

**契约（已交付，见 API 文档 §2.7）**

| 模块 | 前端 UI 期望 | 备注 |
|------|-------------|------|
| `tactics` | 阵型、要点、可读摘要 | 勿让 Web 调 Admin `GET .../tactics` |
| `fantasy` | 阵容/身价相关摘要 | 同上 |
| `headToHead` / `head_to_head` | 交锋统计 | 文档已允许别名 |
| `playerIntelligence` | 列表或计数 + 关键字段 | 非仅 count |
| 赛中扩展 | 事件、走势、文字直播 | 或与 `live` / `match-phase-v1` 分工写清 |

**交付物**

- Swagger 上 `AnalysisPreview` 的**完整 JSON 样例**（含空值语义）
- 说明与 `intel`、`pre-match`/`live`/`post-match` 的字段边界，避免三处重复且不一致

---

### 3.3 海报生成结果 — `POST .../social-poster/generate` + `GET /me/social-posters` — **后端已增强**

| 项 | 内容 |
|----|------|
| **前端** | [`PosterPage.tsx`](src/pages/PosterPage.tsx) |
| **已接** | 下单 `create` + `generate`；历史合并 `listSocialPosters` |
| **缺口** | ~~返回体/历史字段~~ → 已提供 `status`、`posterImageUrl`、`orderNo?`；历史含 `imageUrl`、`template` |

**建议 `generate` 响应 `data`**

- `orderNo?`, `status`, `imageUrl?`, `thumbnailUrl?`, `expiresAt?`, `error?`

**建议 `social-posters` 列表项**

- `orderNo`, `matchId`, `match` 摘要, `imageUrl`, `createdAt`, `template?`

---

### 3.4 订单列表页（前端尚未做页面）

| 项 | 内容 |
|----|------|
| **服务** | [`listMyOrders`](src/services/meApi.ts) → `GET /me/orders` |
| **前端** | **无**「我的订单」独立页面；Upgrade/分析页仅创建订单 |
| **需求** | 若产品需要订单中心，需 UI + 确认 `product` 枚举与分页 |

**建议**

- 文档补充 `OrderProduct` 枚举与列表项字段（金额、状态、支付时间、`matchId`）
- 与 `GET /orders/:orderNo` 详情结构对齐

---

### 3.5 用户资料与账号 — 文档有、Web 未接

| 路径 | 场景 | 前端现状 |
|------|------|----------|
| `PATCH /auth/profile` | 修改昵称、头像 | 设置页未接 |
| `PATCH /auth/password` | 改密 | 未接 |
| `POST /auth/bind-phone` | 绑定手机 | 未接 |
| `POST /auth/bind-wechat` | 绑定微信（支付/openid） | 未接；文档称手机注册用户支付前需 bind |

**需求**

- 个人中心/设置增加「账号与安全」时，需上述接口 + `GET /auth/me` 字段说明（`openid`、是否已绑手机等）
- **Web 支付方案**：若用微信 JSAPI，请提供 **创建订单 → 预支付参数** 的完整流程（当前仅 `POST /orders/.../create`，前端 toast「请在后端流程中完成支付」）

---

### 3.6 世界杯积分榜展示 — `GET .../standings`

| 项 | 内容 |
|----|------|
| **前端** | [`WorldCupPage.tsx`](src/pages/WorldCupPage.tsx) 分组 Tab |
| **已接** | `fetchCompetitionStandings` 已调用 |
| **缺口** | 表格仍用 `worldcup2026-teams?slim=1` 聚合的 **占位积分**（赛/胜/平/负为 0）；standings 结果未渲染进 UI |

**需求**

- 明确 `GET /competitions/:id/standings` 与 `GET /tournaments/:code/standings` 的响应结构（按 `group` 筛选）
- 或提供「世界杯小组积分榜」专用读模型，前端替换 `groupsFromWcTeams` 中的零值占位

---

### 3.7 球员能力 — `GET /players/:id/summary`

| 项 | 内容 |
|----|------|
| **文档** | §2.5 P2 已列出 |
| **前端** | [`RankingsPage`](src/pages/RankingsPage.tsx)、[`PlayerComparePage`](src/pages/PlayerComparePage.tsx) 主要用 **`/football-feed/*`** 或 `/rankings/players` |
| **缺口** | 球员详情/对比未接 `players/:id/summary` |

**需求**

- 提供 `summary` 响应样例（战力、赛季数据、头像等）
- 说明与 `rankings/players`、`football-feed` 的分工，便于前端逐步去掉 feed 依赖（文档 §4 建议生产慎用 feed 配额）

---

## 4. 前端衍生计算 / 静态配置（可选 API）

以下**不一定是缺接口**，但若希望数据权威、可运营，可与后端讨论。

### 4.1 左侧联赛导航 — `SidebarLeft`

| 项 | 内容 |
|----|------|
| **前端** | [`src/sections/SidebarLeft.tsx`](src/sections/SidebarLeft.tsx) |
| **现状** | 联赛名称、场次 `count` 为**写死**；筛选未传 `tournamentId` / `competitionId` 给 `GET /matches` |
| **可选 API** | `GET /tournaments`、`GET /competitions` + 各赛事 `matches` 计数；或 `GET /matches` 聚合统计 |

---

### 4.2 赛程难度 — `SchedulePage`（`/tools/schedule`）

| 项 | 内容 |
|----|------|
| **前端** | [`src/pages/SchedulePage.tsx`](src/pages/SchedulePage.tsx) |
| **现状** | 用全局 `matches` 在前端推算「未来 5 场难度」 |
| **可选 API** | 球队未来赛程 + 难度系数（若产品定义为后端模型输出） |

---

### 4.3 球员榜 / 对比 — 数据源统一

| 页面 | 当前数据源 | 文档推荐 |
|------|-----------|----------|
| `RankingsPage` 球员 Tab | `/football-feed/players/topscorers` 为主，`/rankings/players` 回退 | `/rankings/players` 为主 |
| `PlayerComparePage` | 仅 feed topscorers | `rankings/players` + `players/:id/summary` |
| `FantasyToolPage` | feed | 视 Fantasy 产品定义 |

**需求**：后端保证 `rankings/players` 与 feed 数据口径说明；前端可据此去掉 feed 直连（降低 Key 暴露与配额风险）。

---

### 4.4 CMS 创作者分类 — `CreatorPage`

| 项 | 内容 |
|----|------|
| **已接** | `GET /cms/materials`（失败回退 mock 列表） |
| **仍静态** | `creatorCategories` 网格来自 [`data/mock.ts`](src/data/mock.ts) |
| **可选** | `GET /cms/tools` 或 materials 的 `category` 枚举接口，驱动顶部分类 Tab |

---

### 4.5 个人中心「关注赛事」— `ProfilePage`

| 项 | 内容 |
|----|------|
| **现状** | 写死 `['英超', '欧冠', '西甲', '意甲']` |
| **可选** | 复用 `GET/PATCH /me/preferences` 的 `followedLeagues` / `followedCompetitionIds`，或独立字段 |

---

### 4.6 会员权益对比 — `UpgradePage`

| 项 | 内容 |
|----|------|
| **现状** | [`featureComparison`](src/data/featureComparison.ts) 静态表；价目来自 `GET /orders/pricing` |
| **可选** | 价目接口扩展 `features[]`，或 `GET /cms/membership-plans` |

---

## 5. 架构与联调类（需后端/运维约定）

### 5.1 SSE 赛中流 — `GET /matches/:id/live/stream`

| 项 | 内容 |
|----|------|
| **前端** | [`useMatchLiveStream.ts`](src/hooks/useMatchLiveStream.ts) 使用 `EventSource` |
| **问题** | 浏览器 **无法** 带 `Authorization` 头；若流需登录，需 Cookie 会话、query token（需安全评估）或公开只读流 |
| **需求** | 文档明确 Web/H5 的鉴权方式与重连参数 `lastSeq` 行为 |

---

### 5.2 上游 `football-feed` 代理

| 项 | 内容 |
|----|------|
| **文档** | §4：`@Public()`，生产建议 **BFF/服务端代理**，勿在前端暴露 Key |
| **前端** | 仍直连 `/football-feed/players/topscorers` 等 |
| **需求** | 长期是否改为仅后端聚合接口（`rankings`、`matches` 等），feed 不对浏览器开放 |

---

### 5.3 支付回调与订单状态

| 项 | 内容 |
|----|------|
| **文档** | `POST /wxpay/notify` 为微信服务器回调；Web 端需轮询 `GET /orders/:orderNo` 或 WebSocket/推送 |
| **前端** | 下单后未统一轮询订单状态（分析页仅 refresh unlock） |
| **需求** | Web 支付成功后的 **标准轮询间隔**、订单 `status` 枚举、与 `unlock-status` 的先后关系 |

---

## 6. 已有 C 端能力（供对照，避免重复提需求）

以下在 [缺少的接口-web前端.md](./缺少的接口-web前端.md) 中标记为 **已对接**，此处仅作索引：

| 能力 | 路径 |
|------|------|
| 登录注册 | `/auth/phone/*`、`GET /auth/me` |
| 比赛/情报 | `/matches`、`/matches/:id`、`/intel`、`/analysis-preview`、`/unlock-status` |
| 三页合同 | `/pre-match`、`/live`、`/post-match`、`/live/stream` |
| 订单 | `/orders/pricing`、`/orders/.../create`、`GET /orders/:orderNo` |
| 用户域 | `/me/favorite-matches*`、`/me/match-reminders*`、`/me/preferences`、`/me/report-unlocks`、`/me/social-posters`、`/me/browse-history*`、`/me/notifications*` |
| 报告发现 | `GET /cms/reports` |
| 世界杯 | `/worldcup2026/me/team-follows*`、`worldcup2026-schedule/:teamId`、`standings` |
| 榜单情报 | `/rankings/players`、`/insights/upset-signals`、`/matches/:id/odds-snapshots` |
| 运营 | `/cms/tools`、`/cms/materials`、`POST /feedback` |

**明确不请求 Web 调用的 Admin 接口**（示例）：`GET /matches/:id/tactics`、`GET /matches/:id/fantasy`、`GET /matches/:id/reports`（§3.6）等。

---

## 7. 提需求工单模板（复制即用）

```markdown
## [Web] {功能名称}

**背景**：{页面/用户场景}

**现状**：{本地 mock / 静态 / 已有接口不足}

**建议方案**：
- 方法 + 路径：
- 请求/响应要点：
- 与现有接口关系：{如扩展 report-unlocks，不新增重复列表}

**优先级**：P0 / P1 / P2

**产品确认**：（是否必做 Web / 是否可继续占位）

**验收标准**：
1. ...
2. Swagger `/docs` 示例 + 一条 curl

**前端对接人**：@xxx  **目标版本**：vX.X
```

---

## 8. 建议排期（与后端对齐）

| 批次 | 内容 | 前端改动量 |
|------|------|------------|
| **Batch 1** | `report-unlocks` 字段增强、`analysis-preview` 契约、海报返回 | **后端已完成**；前端对接 |
| **Batch 2** | Web 支付流程 + `GET /orders/:orderNo` 轮询 + `bind-wechat` | 大（**产品待定**） |
| **Batch 3** | `browse-history`、`notifications` | **后端已完成**；前端对接 |
| **Batch 4** | `cms/reports`、standings 渲染、球员 `summary`、订单列表页 | `cms/reports` **后端已完成**；其余前端对接 |
| **Batch 5** | SSE 鉴权方案、football-feed 收口 | 架构 |

---

## 9. 文档维护

| 变更 | 说明 |
|------|------|
| 后端新增/变更路由 | 同步更新 [API-接口对接文档.md](./API-接口对接文档.md) 与本文档 §6 |
| 前端完成对接 | 更新 [缺少的接口-web前端.md](./缺少的接口-web前端.md) 勾选状态 |
| 产品砍 scope | 在对应 §2/§3 标记「Web 不做」，保留占位文案 |

---

*文档生成：Web 前端 API 对接复盘；如有接口已在 Swagger 上线但本文未写，以后端 `/docs` 为准并反馈更新本文档。*
