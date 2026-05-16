# 缺少接口 · 后端开发清单（对照 Web 前端现状）

> **文档目的**：列出当前 **越位线 Web** 产品体验仍依赖本地 mock、占位文案或「即将上线」的 **C 端能力**；便于后端评估是 **新增接口**、**扩展现有接口字段**，还是 **仅开放只读权限/聚合读模型**。  
> **对照基准**：仓库内 [`API接口对接文档-完整版.md`](./API接口对接文档-完整版.md)（与 Swagger `/docs` 一致）。  
> **后端落地（2026-05-13）**：§2 所列 C 端缺口已在 API 实现，详见完整版文档 — `GET/POST/DELETE /me/favorite-matches`、`/me/match-reminders*`、`GET|PATCH /me/preferences`、`GET /me/social-posters`、`GET /me/report-unlocks`、`GET /me/orders`、`GET /rankings/players`、`GET /players/:id/summary`、`GET /insights/upset-signals`、`GET /competitions/:id/standings`、`GET /tournaments/:code/standings`、`GET /cms/tools`、`GET /cms/materials`、`POST /feedback`、`GET /matches/:id/analysis-preview`；**§1** 仍以 **前端对接真实登录/下单** 为主。数据库需执行对应 Prisma migration（含 `UserMatchFavorite` 等表）。  
> **更新建议**：联调进度请同步改本文档勾选与 **`API接口对接文档-完整版.md`**。

---

## 1. 已有接口（文档已列）但 Web 尚未对接 — 非「缺接口」

以下 **后端一般已具备**，前端仍用本地 `useAuth` / `localStorage` 等模拟；若优先产品闭环，可先 **接现有接口** 而非新造路由。

| 能力 | 已有路径（摘要） | Web 现状 |
|------|------------------|----------|
| 手机验证码 / 注册 / 登录 | `POST /auth/phone/send-code`、`register`、`login-password`、`login-otp` | 登录页仍为前端假登录 |
| 当前用户 | `GET /auth/me` | 未接；用户信息写死 localStorage |
| 单场解锁状态 | `GET /matches/:id/unlock-status`（JWT） | 分析页未接 |
| 单场报告下单 | `POST /orders/matches/:matchId/create` | 升级/分析未走真实下单 |
| 会员下单 | `POST /orders/membership/create` | 升级页仅部分逻辑 |
| 海报生成 | `POST /matches/:id/social-poster/generate` | 海报页按钮 `comingSoon` |
| 订单详情 | `GET /orders/:orderNo` | 未接 |
| 世界杯球队关注 | `GET|POST|DELETE /worldcup2026/me/team-follows*` | 未接 |

**给后端的动作**：若本期只做「对齐文档」，这部分以 **前端对接** 为主；后端仅需保证 Swagger 与鉴权、错误码稳定。

---

## 2. 建议新增或明确的 C 端接口（前端真实缺口）

以下为 **当前 Web 仍用 mock / 占位 / 无持久化** 且 **在 §1 所列公开/用户 JSON 中无直接等价物** 的能力。请后端按优先级拆分迭代。

### 2.1 用户域 — 收藏、提醒、设置

| 需求 | 说明 | 建议方向 |
|------|------|----------|
| **比赛收藏** | 收藏页依赖 `user.favorites` + `matchId`，需跨设备一致 | `GET/POST/DELETE /me/favorite-matches`（body: `matchId`），或统一进「用户偏好」子资源 |
| **比赛提醒** | 提醒页「添加提醒」为 `comingSoon`，无持久化与推送 | `GET/POST/PATCH/DELETE /me/match-reminders`（含 `matchId`、`notifyOffsetMinutes`、`channel` 等）；若由第三方推送承接，至少提供 CRUD + 服务端定时任务契约 |
| **通知/展示类用户设置** | 设置页开关仅存前端 state | `GET/PATCH /me/preferences`（JSON blob 或结构化字段：`matchRemind`、`scoreAlert` 等） |

### 2.2 榜单与球员数据 — 公开只读列表

| 需求 | 说明 | 建议方向 |
|------|------|----------|
| **球员榜 / 新星 / 门将 / Fantasy 列表** | 榜单页非「球队」Tab 仍为 mock，并提示无公开列表接口 | 任选其一：**(A)** 新增聚合只读 API，例如 `GET /rankings/players?competitionId=&metric=`；**(B)** 在文档中明确 Web 可调 `GET /football-feed/*`（需 API Key、字段与配额策略），由网关或 BFF 代填 Key |
| **球员对比数据源** | `PlayerComparePage` 使用 mock `players` | 与上条同源：只读列表 + `GET /players/:id/summary`（可选） |
| **冷门 / 爆信号列表** | 右侧栏文案：待情报接口 | `GET /insights/upset-signals?from=&to=&limit=` 返回结构化字段（对阵、概率、摘要、关联 `matchId`）；或约定从 `GET /matches/:id/intel` 的某子字段列表化由后端批处理写入 |

### 2.3 世界杯 — 积分榜与赛程增强

| 需求 | 说明 | 建议方向 |
|------|------|----------|
| **小组赛积分榜（真实积分）** | Web 现用 `worldcup2026-teams?slim=1` 聚组，赛/胜/平/负/净/分为占位 0 | `GET /tournaments/:code/standings` 或 `GET /competitions/:id/standings?group=` 返回与赛程一致的积分模型；或扩展现有赛程接口附带每队累计统计 |
| **球队赛程（单队）** | 文档有 `GET /competitions/:id/worldcup2026-schedule/:teamId`，Web 未接 | 确认是否 **@Public**；若是，前端可替换部分手写聚合 |

### 2.4 内容 / 运营 — 工具、素材、帮助

| 需求 | 说明 | 建议方向 |
|------|------|----------|
| **工具入口配置** | `ToolsPage` 使用本地 `tools` mock | `GET /cms/tools` 或静态 JSON/CDN；字段含 `name`、`path`、`isPremium`、`icon` |
| **创作者素材列表** | `CreatorPage` mock | `GET /cms/materials?category=` |
| **帮助与反馈** | 设置页占位 | `POST /feedback`（文本 + 联系方式）；帮助文档可用静态 URL，不必 API |

### 2.5 海报与订单 — 列表类

| 需求 | 说明 | 建议方向 |
|------|------|----------|
| **海报生成历史** | 海报页「历史记录」`comingSoon` | `GET /me/social-posters?cursor=` 或 `GET /me/orders?type=social_poster` |
| **已购报告列表** | 个人中心/报告相关若需展示 | `GET /me/unlocks` 或 `GET /me/orders?type=match_report`（与现有订单模型对齐即可） |

### 2.6 深度分析只读 — 若产品要对登录用户开放（非 Admin）

当前文档中 **`GET /matches/:id/tactics`、`fantasy`、`head-to-head`、`player-intelligence`** 等挂在 **Admin** 能力上。若产品要在 **C 端分析页** 展示只读切片，需要其一：

- **方案 A**：新增 **用户可读** 路由（如 `GET /matches/:id/tactics-preview`），内部鉴权 + 已解锁/Pro 校验；或  
- **方案 B**：在 **`GET /matches/:id` / `intel`** 的 `data` 中嵌入已生成的子模块摘要（后端组装）。

请后端与产品定 **解锁边界**（与 `unlock-status`、订单类型一致）。

---

## 3. 可不新增后端、但需「约定」的能力

| 能力 | 说明 |
|------|------|
| **赛程难度 / 剩余场次可视化** | Web 现从 `GET /matches` 推导；若后端保证 `kickoffTime`、`status`、球队战力字段稳定，可继续不新增接口。 |
| **联赛筛选 chips** | 依赖 `competition.apiSportsLeagueId` 或等价联赛维度；若列表缺字段，优先 **扩展 `GET /matches` 行结构** 而非新路由。 |

---

## 4. 建议排期（供参考）

| 优先级 | 项 |
|--------|-----|
| P0 | 真实登录 + `GET /auth/me`；收藏/订单/解锁与 `unlock-status` 对齐 |
| P1 | 提醒 CRUD + 用户偏好；海报生成与历史；世界杯 standings 或文档明确 team schedule 公开 |
| P2 | 榜单类只读 API 或 football-feed 使用规范；冷门信号列表 |
| P3 | CMS 工具/素材；反馈接口；C 端只读 tactics/fantasy/h2h 产品方案 |

---

## 5. 联调自检

- [ ] 新接口是否走统一 `{ success, data }` 包装（与 `apiClient` 一致）  
- [ ] C 端只读是否标 `@Public()` 或 JWT + 资源权限说明清楚  
- [ ] 与现有 `GET /matches`、`GET /matches/:id`、`GET /matches/:id/intel` 的 `matchId`（cuid）一致  
- [x] Swagger `/docs` 与 **`API接口对接文档-完整版.md`** 已同步 §2 新增路由（2026-05-13）

---

**文档版本**：与仓库前端代码现状对齐整理（2026-05-13）。
