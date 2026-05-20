> **内容已合并至 [Web前端对接文档-完整版.md](./Web前端对接文档-完整版.md)**；缺口交付状态以下文表格为准。  

以下为可直接转发给后端开发的**业务侧**缺口说明（**不含登录注册、支付**）。

---

## 后端交付状态（2026-05-16）

| 缺口项 | 状态 | C 端路径 / 说明 |
|--------|------|-----------------|
| 侧边栏联赛场次计数 | ✅ | `GET /competitions/match-counts` |
| 赛程难度 | ✅ | `GET /teams/:teamId/upcoming-schedule?days=` |
| 会员权益 `features[]` | ✅ | `GET /orders/pricing`、`GET /cms/membership-plans` |
| 世界杯冠军预测 | ✅ | `GET /insights/champion-prediction?competitionId=` |
| `analysis-preview` teaser 字段 | ✅ | `summary`、`player.photoUrl`/`avatarUrl` |
| `pre-match` 近期战绩/H2H/伤停 | ✅ | `facts.homeForm`、`awayForm`、`h2h`、`homeInjuries`、`awayInjuries` |
| 伤停 BFF | ✅ | `GET /matches/:id/injuries`、`GET /leagues/:code/injuries` |
| `post-match` 事件列表 | ✅ | `facts.events[]`、`eventsCount` |
| `rankings/players` 形状 + AF 回退 | ✅ | `source=auto\|db\|api_football`；见 [Web积分榜球员榜对接说明.md](./Web积分榜球员榜对接说明.md) |
| `players/:id/summary` 对比块 | ✅ | `seasonStats`、`radarHints` |
| `me/preferences` | ✅ | `followedLeagues`、`followedCompetitionIds` |
| CMS 运营配置 | ✅ | `config/cms-*.json` |
| SSE `live_patch` 契约 | ✅ 文档 | 见 API §2.8；patch 仍为 seq 信号，增量 UI 待前端 |
| **管线填库**（events/commentary 非空） | ⚠️ 运维 | [docs/比赛数据管线运维说明.md](./docs/比赛数据管线运维说明.md) |
| 登录注册 / 支付 | ⏸ 本期不做 | 与下文「排除」一致 |

---

# Web 前端 — 业务侧仍缺接口 / 字段 / 功能模块（给后端）

**范围**：比赛、分析、榜单、世界杯、用户偏好、运营 CMS、导航等。  
**排除**：登录注册、支付、bind-wechat、订单支付轮询等（本期暂不推进）。  
**约定**：C 端只用文档中的 REST；`matchId` / `teamId` / `playerId` 用库表 **cuid**；响应统一 `{ success, data, message }`。

---

## 一、完全没有 C 端接口（前端只能演示或本地推算）

| 序号 | 功能模块 | 前端页面 | 期望能力 | 建议接口或方案 |
|------|----------|----------|----------|----------------|
| 1 | 左侧联赛导航 — 各联赛**场次数量** | `SidebarLeft` | 展示「英超 6 场」等真实计数，并按赛事筛 `GET /matches` | `GET /tournaments` + `GET /competitions`；或 `GET /matches` 聚合（按 `competitionId`/`leagueCode` 计数）；列表筛选用 `competitionId` / `tournamentId` Query |
| 2 | 赛程难度 | `SchedulePage`（`/tools/schedule`） | 「未来 N 场难度」由模型输出，而非前端用列表粗算 | 球队未来赛程 + `difficulty` / `difficultyScore`（可按 `teamId` + 日期范围） |
| 3 | 会员权益对比表 | `UpgradePage` | Pro/免费权益表可运营配置 | `GET /orders/pricing` 扩展 `features[]`，或 `GET /cms/membership-plans` |
| 4 | 世界杯 AI 冠军预测 | `WorldCupPage` | 冠军概率/路径（非冷门） | 产品定：专用读模型或 `GET /insights/champion-prediction`；冷门已接 `GET /insights/upset-signals` |
| 5 | 分析页扩展 — **整块仍无合同** | `MatchDetailSupplement` | 见下文「第二节」各子模块；`pre-match`/`live`/`post-match` 未覆盖部分 | 并入 phase 合同或 `analysis-preview` / `intel` 子对象，并写清与现有接口边界 |

**说明**：Admin 路径（如 `GET /admin/matches/:id/tactics`）Web **不会调用**；请在 C 端 `analysis-preview`、`intel`、三页 phase 中提供等价可读数据。

---

## 二、已有接口路径，但数据常为空或字段不足（需管线 / 填库）

### 2.1 比赛分析 — 情报与三页合同

| 接口 | 现状（联调观测） | 前端影响 | 需要后端补齐 |
|------|------------------|----------|--------------|
| `GET /matches/:id/analysis-preview` | 部分场次 `tactics` / `playerIntelligence` 为空 | 分析页 Teaser 空；扩展区大量演示 | 跑通情报管线（见《比赛数据管线运维说明》）；保证 `analysis-preview-v1` 稳定返回 |
| `GET /matches/:id/pre-match` | 有 `teamSnapshots`，`narrative` 可能为空 | 赛前叙事、扩展区缺数据 | `narrative` 或结构化赛前块；**伤停、近期战绩、H2H** 建议在此或 preview 给出 |
| `GET /matches/:id/live` | `facts.live`（`match-live-v1`）存在，但 **events / commentary 常为空** | 赛中事件、文字直播仍走演示 | 赛中 Cron / `ENABLE_AF_LIVE_FACTS_CRON` 等写入事件、文字直播、`teamStats`、`keyMetrics.momentum` |
| `GET /matches/:id/post-match` | 有 `ftHome`/`ftAway`，**eventsCount=0、events 常无** | 赛后事件、综述部分演示 | 终场事件列表、`narrative.summary` / `structuredSummary` / `motm` |
| `GET /matches/:id/intel` | 依赖解锁 + 管线 | 付费全文区 | 与 `analysis-preview` 字段边界文档化；解锁后模块齐全 |
| `GET /matches/:id/odds-snapshots` | 常无快照 | 盘口卡片显示「暂无」 | 持久化 `MatchOddsSnapshot`（T24/T1/LIVE） |

**`analysis-preview-v1` 建议稳定提供的字段（Teaser，非 Admin）**：

- `meta.contractVersion`、`meta.fieldBoundary`（与 intel / phase 分工说明）
- `tactics`：条目列表（阵型、要点、摘要；未解锁含 `locked`、`scenarioType`）
- `fantasy`：摘要或 `locked`
- `headToHead` / `head_to_head`（交锋统计，别名二选一或同内容）
- `playerIntelligence`：`{ count, items[] }`，每项含 `photoUrl`、`locked`、关键指标；保留 `playerIntelligenceCount` 兼容
- `summary`（可选）

**`match-live-v1`（`GET .../live` 的 `facts.live`）建议字段**：

- `events[]`：`minute`, `type`, `team`/`side`, `playerName`, `detail`
- `commentary[]`：字符串或 `{ minute, text }`
- `teamStats`：主客对比（控球、射门、射正、角球、犯规、黄红牌等）
- `keyMetrics.momentum[]`：`minute`, `home`, `away`（走势条）
- `meta.recommendedPollSec`（已有）

**`post-match` / `pre-match` 建议补充（扩展区仍用 mock 的部分）**：

| 前端 UI 块 | 当前来源 | 建议数据来源 |
|------------|----------|--------------|
| 主客队近期战绩 `homeForm` / `awayForm` | mock | `pre-match.facts` 或 preview |
| 交锋 `h2h` | mock | `analysis-preview.headToHead` 或 pre-match |
| 伤停 `homeInjuries` / `awayInjuries` | mock | pre-match / injuries BFF（勿让 Web 直连 `football-feed/injuries`） |
| 扩展盘口 `odds`（多玩法） | mock | `odds-snapshots` 或 model 块 |
| AI 深度分析全文（预测、关键球员、战术解读、比分分布等） | mock | `intel` 或 preview 结构化字段 |
| 高阶预测矩阵、裁判、舆情、区域热图、战术维度对比、盘口验证 | mock | `intel` 子模块或 post-match `model` |

请提供 **Swagger 完整 JSON 样例**（含空值语义），避免与 `intel`、`narrative` 三处重复且不一致。

### 2.2 球员榜与对比

| 接口 | 现状 | 前端影响 | 需要补齐 |
|------|------|----------|----------|
| `GET /rankings/players` | 生产 **`items` 常为空数组** | 自动回退浏览器直连 `football-feed/players/topscorers` | 按 `metric`（`powerRating` / `fantasyPrice` / `fbrefMinutes`）、`competitionId`、`limit` 返回榜单 |
| `GET /players/:id/summary` | 路径已有，依赖有效 **player cuid** | 对比页仅展示列表字段 + 市值等少量 summary | 完整对比维度（赛季数据、多指标、头像 `avatarUrl` 等） |

**`GET /rankings/players` 列表项建议字段**：

- `rank`, `playerId`（cuid）, `metric` 数值  
- `player`：`nameCn`, `nameEn`, `avatarUrl`, `position`, `teamName`, `teamLogo`  
- `goals`, `assists`, `age`, `minutes`（视 metric）  
- `marketValue`, `marketValueCurrency`, `fantasyPrice`  
- Fantasy 相关：`selectedBy`, `form`, `nextFixture`, `captainPercent`（若有）

**长期**：生产环境 **不要依赖** 前端直连 `/football-feed/*`；由 BFF（`rankings/players`、matches 聚合）统一出口。

### 2.3 联赛积分榜（非世界杯）

| 接口 | 现状 | 前端影响 | 需要补齐 |
|------|------|----------|----------|
| `GET /leagues/standings?codes=PL,PD,...&season=` | **英超等有数据**，与文档一致 | 榜单「球队」Tab 已接；`all` / 无 code 时仍用列表衍生战力 | 文档明确 `codes` 枚举（PL/PD/SA/BL1/FL1/CL 等与前端 chip 映射）；多联赛一次 BFF |
| `GET /competitions/:id/standings` | 世界杯已用；赛果未到时 rows 空 | 世界杯分组 0 分占位 | 赛历开始后 rows 及时更新（与现网一致即可） |

### 2.4 用户偏好（非账号安全）

| 接口 | 现状 | 前端影响 | 需要补齐 |
|------|------|----------|----------|
| `GET/PATCH /me/preferences` | 设置页已同步通知类字段 | 个人中心「关注赛事」仍可能为静态演示 | 增加并文档化：`followedLeagues`（展示名数组）和/或 `followedCompetitionIds`（cuid 数组）；PATCH 可写 |

### 2.5 运营 CMS

| 接口 | 现状 | 前端影响 | 需要补齐 |
|------|------|----------|----------|
| `GET /cms/reports` | 有则展示；失败用静态样例 | Report 发现页 | 稳定运营数据或明确「仅样例」 |
| `GET /cms/materials` | 有则展示；失败/mock | Creator 素材列表 | 稳定列表；`category` 枚举一致（前端已用 category 生成 Tab） |
| `GET /cms/tools` | 已接 Tools 页 | — | 保持可用即可 |

---

## 三、已有接口且前端已接，但能力未完成（可选 / 架构）

| 项 | 说明 | 对业务的影响 |
|----|------|--------------|
| `GET /matches/:id/live/stream`（SSE） | 前端仅连公开流、记 `seq`，**未把 `live_patch` 合并进扩展区 UI** | 赛中仍主要靠 REST 轮询 `live` + 列表；若需秒级事件，需约定 patch 结构与字段同 `match-live-v1` |
| `GET /matches` 列表 | 已接日期、LIVE、轮询 hint | 可增强：按 `competitionId` 筛选、侧边栏联赛与列表联动 |
| `GET /insights/upset-signals` | 已接榜单冷门、世界杯冷门 Tab | 保持数据更新即可 |
| 球队战力榜（`MatchesDataContext.teams`） | 由比赛列表**前端衍生**，非权威 | 有 `leagues/standings` 时优先积分榜；无 standings 时保留衍生排序并标注「演示」 |

---

## 四、按页面汇总的「仍缺真实数据」功能模块

| 页面 | 仍演示 / 占位 / 回退的模块 | 优先对接的后端能力 |
|------|---------------------------|-------------------|
| **分析页** `AnalysisPage` | 扩展区：近期战绩、H2H、伤停、多玩法盘口、AI 长文分析、高阶预测、裁判/舆情/热图/盘口验证等；部分场次事件/文字直播/走势 | `intel` + 填满 `live`/`post-match`/`analysis-preview`；管线运维 |
| **榜单** `RankingsPage` | `rankings/players` 空则 feed；球队 Tab 无 standings 时战力排序演示 | 填 `rankings/players`；`leagues/standings` 覆盖主要联赛 |
| **球员对比** `PlayerComparePage` | summary 失败时仅列表字段；雷达为前端估算 | `players/:id/summary` 多维度结构化 |
| **Fantasy 工具** `FantasyToolPage` | 同 rankings，空则 feed | `rankings/players?metric=fantasyPrice` |
| **世界杯** `WorldCupPage` | AI 冠军预测为产品演示；积分榜无赛果时为 0 | 冠军预测 API（可选）；standings 赛果 |
| **左侧栏** `SidebarLeft` | 联赛场次 count 写死 | 赛事列表 + 计数 API |
| **赛程工具** `SchedulePage` | 难度本地推算 | 球队未来赛程 + 难度 |
| **升级页** `UpgradePage` | 权益对比静态表（价目已接 pricing） | membership-plans 或 pricing.features |
| **报告发现** `ReportPage` | CMS 失败时静态样例 | `cms/reports` 稳定 |
| **创作者** `CreatorPage` | 素材失败时 mock 列表 | `cms/materials` 稳定 |
| **个人中心** `ProfilePage` | 无 `followedLeagues` 时关注赛事演示 | `me/preferences` 字段 |
| **海报** `PosterPage` | 无图时本地模板预览（有 `imageUrl` 时已优先服务端图） | 业务上可维持；非支付链路 |

---

## 五、建议后端排期优先级（仅业务）

**P0 — 直接影响「像真数据」**

1. 情报管线 + `analysis-preview-v1` / `intel` 非空（战术、球员情报、摘要）。  
2. `live` / `post-match` 的 **events、commentary、teamStats、momentum、赛后 narrative**。  
3. **`GET /rankings/players`** 按联赛/指标返回非空 `items`（含头像、市值、Fantasy 价）。  

**P1 — 减少演示块**

4. `pre-match` 或 preview：**近期战绩、H2H、伤停**。  
5. **`GET /players/:id/summary`** 对比用完整结构。  
6. **`GET /leagues/standings`** 覆盖五大联赛 + 文档 codes 映射。  
7. **`me/preferences.followedLeagues`**（或 competitionIds）。  

**P2 — 体验与运营**

8. 侧边栏赛事 + 场次计数；赛程难度 API。  
9. CMS：reports / materials 稳定；membership 权益配置。  
10. 世界杯冠军预测（若产品需要）；SSE `live_patch` 字段与 REST 对齐（前端后续可接增量 UI）。  

---

## 六、请后端一并提供的交付物

1. 上述接口的 **Swagger 样例**（含 LIVE / FINISHED 各一场）。  
2. **`analysis-preview` vs `intel` vs `pre-match`/`live`/`post-match`** 字段边界说明（避免三处重复）。  
3. **`rankings/players` 与 football-feed 射手榜** 的数据口径说明，便于前端下线浏览器直连 feed。  
4. 管线/环境开关清单（如 live facts Cron），便于排查「接口有但永远空」。

