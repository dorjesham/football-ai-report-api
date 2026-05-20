> **内容已合并至 [Web前端对接文档-完整版.md](./Web前端对接文档-完整版.md)**（§5 比赛详情）。下文保留备查。

# Web 比赛详情对接说明

> **日期**：2026-05-16  
> **API**：`https://oaifjhzmpswi.sealosbja.site`（无 `/api` 前缀）  
> **前端**：`https://oovxhxiusmdy.sealosbja.site`  
> **统一响应**：`{ success, data, message }`（SSE 除外）

---

## 1. 页面加载顺序

建议首屏并行请求（`matchId` 为列表/路由带入的 **cuid**）：

| 顺序 | 接口 | 鉴权 | 说明 |
|------|------|------|------|
| 1 | `GET /matches/:id` | 无 | 头图、比分、赛事、`unlockPrice`、`predictionPreview` |
| 1 | `GET /matches/:id/unlock-status` | Bearer（可选） | 已登录时查是否已解锁 |
| 1 | `GET /matches/:id/analysis-preview` | 可选 Bearer | 契约 **analysis-preview-v1** |
| 2 | 按 `status` 选一路 | 可选 Bearer | `pre-match` / `live` / `post-match`（`match-phase-v1`） |
| 2 | `GET /matches/:id/odds-snapshots` | 无 | 赔率快照 |
| 2 | `GET /matches/:id/injuries` | 无 | 伤停 BFF（**勿**直连 `/football-feed/injuries`） |
| 3 | `GET /matches/:id/intel` | Bearer | **仅已解锁**拉全文 |
| 赛中 | `GET /matches/:id/live/stream` | 见 API §2.8 | SSE：首包 `snapshot`，后续 `live_patch`（seq 信号） |

```mermaid
sequenceDiagram
  participant Web as WebDetailPage
  participant API as MatchesAPI
  Web->>API: GET /matches/:id
  Web->>API: GET /matches/:id/unlock-status
  Web->>API: GET /matches/:id/analysis-preview
  Web->>API: GET /matches/:id/pre-match or live or post-match
  Web->>API: GET /matches/:id/odds-snapshots
  opt unlocked
    Web->>API: GET /matches/:id/intel
  end
  opt LIVE
    Web->>API: SSE /matches/:id/live/stream
  end
```

**勿调用** Admin 路由（如 `/admin/matches/:id/tactics`）；C 端用 `analysis-preview` 与 `intel`。

### 1.1 v2 推荐路径（2026-05-22）

| 接口 | 说明 |
|------|------|
| `GET /api/v2/matches/:matchId/detail` | **主接口（方案 A）**：与下表同 schema |
| `GET /matches/:matchId/detail-v2` | **兼容路径**（90 天）：响应头 `Deprecation: true`，`Link` 指向 api-v2 |
| `GET /api/v2/matches/:matchId/access` | 仅解锁状态与 paywall |
| `POST /api/v2/matches/:matchId/unlock` | 创建单场解锁订单（等同 `POST /orders/matches/:id/create`） |
| B4 档案 | `GET /api/v2/teams/:id/transfers|trophies`、`GET /api/v2/players/:id/trophies|sidelined`（不进 detail） |

**付费矩阵（未开赛 SCHEDULED）**：`freeModules.injuries` / `lineups` 免费；`paidModules.predictions` / `odds` / AI 块未解锁时 `locked: true` 且 `data: null`。

**字段映射（旧 → 新）**：

| 旧 | 新 |
|----|-----|
| `intel.paid.dashboard.detail` | `paidModules.predictions.data`（AF 整包） |
| `intel.paid.tactics` | `paidModules.tacticalScript.data` |
| `pre-match.ui` | `freeModules` + `paidModules` |
| OLS `powerRating` | 已下线 |

`intel` / `pre-match` / `analysis-preview` 仍可用但响应含 `deprecated: true`。

运维后台（非 C 端）：`/admin` → 侧栏「AF 档案」含联赛 B2 / 球队 B4 / 球员 B4 Catalog 页；比赛列表可查看 B4/B5 状态并触发同步。

---

## 2. 字段边界

| 能力 | 接口 | 内容 |
|------|------|------|
| 分析页 Teaser | `analysis-preview` | 战术条数/标题、Fantasy 摘要、交锋统计、球员情报条目；未解锁含 `locked: true` |
| 付费全文 | `intel` | 与解锁态一致的多模块长文 |
| 三页叙事 | `pre-match` / `live` / `post-match` | `narrative`、结构化块；赛前 `facts` 含 `homeForm`/`awayForm`/`h2h`/`homeInjuries`/`awayInjuries`；赛后 `facts.events[]` |
| 伤停 | `GET /matches/:id/injuries` | 与 pre-match 伤停块同源；联赛维度见 `GET /leagues/:code/injuries` |

`analysis-preview` 的 `meta.fieldBoundary` 与 [API接口对接文档-完整版.md](./API接口对接文档-完整版.md) §2.7 一致。

---

## 3. 解锁态

- `GET /matches/:id/unlock-status` → `data.isUnlocked`
- `analysis-preview` / `intel` 的 `isUnlocked` 应与上式一致
- 未解锁：`playerIntelligence.items[].locked`、`fantasy.locked`、`headToHead.locked` 等

---

## 4. curl 验收（公网）

将 `MATCH_ID` 换为真实场次（非历史种子 `seed-match-admin-showcase`）：

```bash
API=https://oaifjhzmpswi.sealosbja.site
MATCH_ID=你的比赛cuid

curl -sS "$API/matches/$MATCH_ID" | jq '.success, .data.id, .data.status'
curl -sS "$API/matches/$MATCH_ID/analysis-preview" | jq '.data.meta, .data.tactics.count, .data.playerIntelligence.count'
curl -sS "$API/matches/$MATCH_ID/pre-match" | jq '.data.facts | {homeForm, awayForm, h2h, injuries: .dataAvailability.injuries}'
curl -sS "$API/matches/$MATCH_ID/injuries" | jq '.data.items | length'
```

若 `tactics` / `playerIntelligence` 为空，多为库内未跑情报管线，见 [docs/比赛数据管线运维说明.md](./docs/比赛数据管线运维说明.md)。

---

## 5. 相关文档

- [后端接口需求—web前端.md](./后端接口需求—web前端.md) §3.2  
- [API接口对接文档-完整版.md](./API接口对接文档-完整版.md) §2.7  
- 积分榜 / 球员榜：[Web积分榜球员榜对接说明.md](./Web积分榜球员榜对接说明.md)  
- SSE：[API §2.8](./API接口对接文档-完整版.md)
