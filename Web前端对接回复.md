# Web 前端对接回复（Batch 1 + §2）

> **日期**：2026-05-17（登录改造 2026-05-17）  
> **对照**：[后端接口需求—web前端.md](./后端接口需求—web前端.md)、[API接口对接文档-完整版.md](./API接口对接文档-完整版.md)  
> **Swagger**：非 production 环境 `{API_ORIGIN}/docs`

---

## 1. 结论摘要

| 问题 | 答复 |
|------|------|
| 是否有后端提供的 `meApi` 包/SDK？ | **无**。后端交付 **REST 路由**；请在 Web 工程内用现有 `apiClient` 自建 `src/services/meApi.ts` 封装下列路径。 |
| 本期后端做了什么？ | **Batch 1 + §2** 用户域；**登录 MVP**：Web 微信扫码、图形验证码注册、邮箱/用户名密码登录。 |
| 联调前必做 | `npx prisma migrate deploy`（含 `20260516120000_*`、`20260517120000_auth_email_username_wechat_web`）。 |
| 登录文档 | **[登录注册对接说明.md](./登录注册对接说明.md)** |

---

## 2. 登录注册（2026-05-17，请优先改前端）

| 能力 | 路径 |
|------|------|
| Web 微信扫码 | `GET /auth/wechat/web/authorize`、`GET /auth/wechat/web/callback` |
| 小程序 | `POST /auth/wechat-login`（不变） |
| 图形验证码 / 极验 | `GET /auth/captcha`（`provider: svg` \| `geetest`） |
| 注册 | `POST /auth/register`（**勿再用** `phone/register` 作默认） |
| 登录 | `POST /auth/login`（`identifier` + 密码） |
| Apple | `POST /auth/apple/login`（`idToken`）；绑定 `POST /auth/bind-apple` |
| Google Web | `GET /auth/google/authorize`、`/auth/google/callback` |
| Google 一键 | `POST /auth/google/login`（`idToken`）；绑定 `POST /auth/bind-google` |
| 绑定手机 | `POST /auth/phone/send-code`（`purpose: "bind"`）+ `POST /auth/bind-phone` |
| 找回密码 | `POST /auth/password/forgot-phone`、`/auth/password/reset-phone` |

环境变量：`WECHAT_OPEN_*`、`GOOGLE_*`、`APPLE_CLIENT_ID`、`GEETEST_*`、`AUTH_REQUIRE_VERIFIED_PHONE`。请求头建议持久化 **`X-Device-Id`**（UUID）。

**手机门禁**（`AUTH_REQUIRE_VERIFIED_PHONE=true`）：写 `/me/*`、下单 `POST /orders/*` 返回 403，`code: PHONE_VERIFICATION_REQUIRED` → 弹窗引导 `bind-phone`。支付仍须小程序 **`openid`**（`bind-wechat`）。

---

## 3. 关于 `meApi.ts`（前端自建）

建议映射（函数名可自定）：

| 建议函数 | 方法 | 路径 |
|----------|------|------|
| `listFavorites` / `addFavorite` / `removeFavorite` | GET/POST/DELETE | `/me/favorite-matches*` |
| `listReminders` / … | GET/POST/PATCH/DELETE | `/me/match-reminders*` |
| `getPreferences` / `patchPreferences` | GET/PATCH | `/me/preferences` |
| `listSocialPosters` | GET | `/me/social-posters` |
| `listReportUnlocks` | GET | `/me/report-unlocks` |
| `listMyOrders` | GET | `/me/orders` |
| **`listBrowseHistory`** | GET | `/me/browse-history` |
| **`recordBrowseHistory`** | POST | `/me/browse-history` |
| **`listNotifications`** | GET | `/me/notifications` |
| **`markNotificationRead`** | PATCH | `/me/notifications/:id` |
| **`readAllNotifications`** | POST | `/me/notifications/read-all` |
| `getAuthMe` | GET | `/auth/me` |

---

## 4. 本期新增 / 增强接口（用户域 Batch 1 + §2）

### 3.1 浏览历史（§2.1）

**`GET /me/browse-history`** — JWT  
Query：`cursor`（上一页最后一项 `id`）、`limit`（默认 20，最大 50）

**`POST /me/browse-history`** — JWT  
Body：

```json
{
  "type": "analysis",
  "matchId": "cuid...",
  "title": "可选，缺省用主客队+赛事拼标题",
  "sub": "可选副标题",
  "visitedAt": "2026-05-16T12:00:00.000Z"
}
```

- `type`：`analysis` | `poster` | `view`（小写，与枚举互转）
- **`analysis` / `poster` 必须带 `matchId`**
- **同 `userId + matchId + type` 再次 POST 会 upsert 更新 `visitedAt`**（非每次新增一条）
- **无 `matchId` 的 `view`**：每次 POST 新建一条（适用于无比赛上下文浏览）

列表项：`id`, `type`, `matchId`, `title`, `sub`, `visitedAt`, `match?`（与收藏列表同结构的摘要）

---

### 3.2 通知收件箱（§2.2）

**与 `/me/match-reminders` 分工**

| 接口 | 用途 |
|------|------|
| `/me/match-reminders` | 开赛前 N 分钟 **赛程提醒**（Cron/推送占位） |
| `/me/notifications` | **系统/支付/海报** 类消息中心 |

**`GET /me/notifications`** — JWT  
Query：`cursor`（上一项 `id`）、`limit`、`unreadOnly`（`true`/`false`/`1`/`0`）

**`PATCH /me/notifications/:id`** — Body：`{ "read": true }`（仅支持标已读）

**`POST /me/notifications/read-all`**

**服务端写入（无需前端调）**

- 微信支付回调成功 → 报告解锁 / 会员 / 海报额度类通知
- `POST /matches/:id/social-poster/generate` 成功 →「海报已生成」

列表项：`id`, `type`（`ORDER_PAID` | `POSTER_READY` | `POSTER_CREDIT` | `MEMBERSHIP` | `SYSTEM`）, `title`, `desc`, `icon?`, `color?`, `read`, `link?`, `orderNo?`, `createdAt`

---

### 3.3 CMS 报告发现（§2.3）

**`GET /cms/reports`** — 公开  
Query：`category?`, `type?`（`match` | `season` | `team` | `player`）

响应：`{ "items": [ { "id", "title", "summary", "type", "league", "tags", "isPremium", "publishedAt", "preview?", "category?" } ] }`

> 首期为**内置运营样例**，非 Admin 可编辑；后续可换 DB/CMS。

---

### 3.4 Batch 1 — `GET /me/report-unlocks`（增强）

每项在原有 `match`、`order` 基础上增加：

| 字段 | 说明 |
|------|------|
| `title` | 主客队 + 赛事可读标题 |
| `unlockedAt` | `order.paidAt ?? createdAt` |
| `reportStatus` | 已发布报告 `PUBLISHED`，否则 `NONE` |
| `freeSummary` | 已发布报告摘要（约 200 字截断）；无报告为 `null` |

全文仍走 `GET /matches/:id/intel` 或三页合同 `narrative`。

---

### 3.5 Batch 1 — 海报

**`POST /matches/:id/social-poster/generate`** 响应 `data` 增加：

```json
{
  "status": "ok",
  "ok": true,
  "billing": "PAID_ORDER | FREE_MONTHLY | MEMBER | DEV_BYPASS",
  "orderNo": "ord_...",
  "posterImageUrl": "https://...",
  "posterGeneratedAt": "2026-05-16T..."
}
```

**`GET /me/social-posters`** 列表项增加：`matchId`, `imageUrl`, `posterGeneratedAt`, `template`（用户主题文案）

---

### 3.6 Batch 1 — `GET /matches/:id/analysis-preview`（`analysis-preview-v1`）

- 顶层增加 **`meta.contractVersion`** = `analysis-preview-v1`
- **`head_to_head`** 与 **`headToHead`** 内容相同（别名）
- **`playerIntelligence`**：`{ count, items[] }`（最多 6 条；未解锁为 teaser，含 `locked: true`）
- 未解锁战术项含 **`scenarioType`**
- 保留 **`playerIntelligenceCount`** 兼容旧前端

完整样例见 [API接口对接文档-完整版.md](./API接口对接文档-完整版.md) **§2.7**。

赛中事件/文字直播请用 **`GET /matches/:id/live`** 或 SSE **`/live/stream`**，不在本接口重复。

---

## 4. 已有接口 — 请前端直接对接（后端不再新做）

| 能力 | 路径 |
|------|------|
| 账号资料/改密/绑定 | `GET /auth/me`，`PATCH /auth/profile`，`PATCH /auth/password`，`POST /auth/bind-*` |
| 订单列表 | `GET /me/orders?product=&cursor=&limit=` |
| 订单详情 | `GET /orders/:orderNo` |
| 世界杯积分榜 | `GET /competitions/:id/standings?group=`、`GET /tournaments/:code/standings` |
| 球员摘要 | `GET /players/:id/summary` |
| 球员榜 | `GET /rankings/players` |

---

## 5. 仍待产品 / 下期（本期后端未做）

| 项 | 说明 |
|----|------|
| **Web 全站支付** | 当前下单返回 **微信 JSAPI `payParams`**（依赖用户 `openid`，偏小程序）。Web H5/扫码需产品定方案后再开发。建议：下单后轮询 **`GET /orders/:orderNo`**，成功后再 `GET /matches/:id/unlock-status`。 |
| **SSE 登录态** | `GET /matches/:id/live/stream` 现为 **`@Public()`** 只读流；`EventSource` 无法带 `Authorization`。若需私有流需另议（query token / Cookie）。 |
| **§4 可选** | 侧边栏联赛计数、赛程难度 API、会员权益 CMS、`football-feed` 浏览器直连收口等。 |

---

## 6. 联调自检

- [ ] 已 `prisma migrate deploy`（含 `UserBrowseHistory`、`UserNotification`）
- [ ] 所有请求解析 `{ success, data }`
- [ ] `matchId` / `teamId` 使用接口返回 **cuid**
- [ ] 历史页：进入分析页时 `POST /me/browse-history`（`type: analysis`），列表改 `GET /me/browse-history`
- [ ] 通知页：勿用 `match-reminders` 数据冒充消息中心
- [ ] Report 页底部：使用 `report-unlocks` 的 `title` / `freeSummary`
- [ ] Swagger `/docs` 与本文、完整版 API 文档一致

---

## 7. 联系与文档

- 路由全集：**[API接口对接文档-完整版.md](./API接口对接文档-完整版.md)** §2、§2.5、§2.7  
- 缺口追踪：**[缺少的接口-web前端.md](./缺少的接口-web前端.md)**（已更新 2026-05-16）
