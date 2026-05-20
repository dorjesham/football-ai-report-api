> **内容已合并至 [Web前端对接文档-完整版.md](./Web前端对接文档-完整版.md)**（§6、§7 CMS/工具）。下文保留备查。

# Web 赛程工具对接说明

> **日期**：2026-05-16  
> **页面**：`SchedulePage`（`/tools/schedule`）  
> **统一响应**：`{ success, data, message }`

---

## 1. 未来赛程与难度

```http
GET /teams/:teamId/upcoming-schedule?days=30
```

| 参数 | 说明 |
|------|------|
| `teamId` | 球队 **cuid**（来自 `GET /matches` 或世界杯球队列表） |
| `days` | 未来天数窗口，默认 **30**，最大 90 |

`data` 形状（节选）：

```json
{
  "teamId": "seed-team-xxx",
  "days": 30,
  "items": [
    {
      "matchId": "cuid",
      "kickoffTime": "2026-05-20T15:00:00.000Z",
      "side": "home",
      "opponent": { "id": "...", "nameCn": "对手", "logoUrl": "..." },
      "competition": { "id": "seed-comp-pl", "code": "PL", "nameCn": "英超" },
      "difficultyScore": 72,
      "difficulty": "hard"
    }
  ]
}
```

| `difficulty` | 含义（启发式） |
|--------------|----------------|
| `easy` | 对手积分榜 rank 较弱 |
| `medium` | 中游 |
| `hard` | 前列 |

`difficultyScore` 为 0–100 数值，便于排序/图表；基于对手当前联赛 rank（`LeaguesStandingsService` / 球队 snapshot），赛季初可能缺 rank 时回落 `medium`。

---

## 2. 侧边栏联赛场次计数

```http
GET /competitions/match-counts?from=2026-05-01T00:00:00Z&to=2026-05-31T23:59:59Z&status=SCHEDULED
```

返回 `items[]`：`competitionId`, `code`, `nameCn`, `matchCount`。与 `GET /matches?competitionId=` 筛选联用。

---

## 3. curl 验收

```bash
API=https://oaifjhzmpswi.sealosbja.site
TEAM=替换为真实球队cuid

curl -sS "$API/teams/$TEAM/upcoming-schedule?days=14" | jq '.data.items | length, .data.items[0].difficulty'

curl -sS "$API/competitions/match-counts?status=SCHEDULED" | jq '.data.items | map({code, matchCount})'
```

---

## 4. 相关文档

- [API接口对接文档-完整版.md](./API接口对接文档-完整版.md) §2.1、§2.5 P3  
- [Web 前端 — 业务侧缺口文档.md](./Web%20前端%20—%20业务侧缺口文档.md)（交付状态表）
