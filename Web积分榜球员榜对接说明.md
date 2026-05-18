# Web 积分榜与球员榜对接说明

> **日期**：2026-05-16  
> **API**：`https://oaifjhzmpswi.sealosbja.site`  
> **统一响应**：`{ success, data, message }`

---

## 1. 联赛 code 与 `competitionId` 对照

与种子 / `GET /competitions` 一致，前端筛选用：

| code | competitionId | 说明 |
|------|-----------------|------|
| PL | `seed-comp-pl` | 英超 |
| PD | `seed-comp-pd` | 西甲 |
| SA | `seed-comp-sa` | 意甲 |
| BL1 | `seed-comp-bl1` | 德甲 |
| FL1 | `seed-comp-fl1` | 法甲 |
| CL | `seed-comp-cl` | 欧冠 |
| EL | `seed-comp-el` | 欧联 |
| UECL | `seed-comp-uecl` | 欧协联 |

API-Football `league` id 映射见服务端 [`src/api-football/api-football.constants.ts`](src/api-football/api-football.constants.ts)（如 PL→39，season=2025 表示 2025-26 赛季）。

---

## 2. 积分榜（推荐 BFF，勿浏览器直连 `/football-feed`）

### 2.1 多联赛

```http
GET /leagues/standings?codes=PL,PD,SA,BL1,FL1,CL,EL&season=2025&source=auto
```

| 参数 | 说明 |
|------|------|
| `codes` | 逗号分隔，默认 `PL,PD,SA,BL1,FL1,CL,EL` |
| `season` | 默认 `2025` |
| `source` | `auto`（DB 已完赛≥5 队则用库内聚合，否则 api-sports）\| `db` \| `api_football` |

`data` 形状：

```json
{
  "season": 2025,
  "leagues": [
    {
      "code": "PL",
      "competitionId": "seed-comp-pl",
      "season": 2025,
      "source": "api_football",
      "rows": [
        {
          "rank": 1,
          "teamId": 50,
          "teamName": "Manchester City",
          "teamLogo": "https://...",
          "played": 10,
          "wins": 7,
          "draws": 2,
          "losses": 1,
          "goalsFor": 20,
          "goalsAgainst": 5,
          "goalDifference": 15,
          "points": 23
        }
      ]
    }
  ]
}
```

### 2.2 单联赛

```http
GET /leagues/PL/standings?season=2025&source=api_football
```

### 2.3 与后台「同步积分榜」的区别

| 能力 | 路径 / 入口 | 用途 |
|------|-------------|------|
| **C 端展示** | `GET /leagues/:code/standings` | 实时积分榜，api-sports 规范化 |
| **库内聚合** | `GET /competitions/:id/standings` | 仅 `FINISHED` 场次累加，赛季初常为空 |
| **Admin 单场** | 比赛详情 →「同步积分榜」 | **Football-Data** 写入该场 `TeamMatchSnapshot` 的 rank/points，**不是**上表 BFF |

---

## 3. 球员榜与摘要

### 3.1 榜单

```http
GET /rankings/players?competitionId=seed-comp-pl&metric=fantasyPrice&limit=20
```

| `metric` | 展示建议 |
|----------|----------|
| `fantasyPrice` | 身价/ fantasy 价（降序） |
| `powerRating` | 战力 |
| `fbrefMinutes` | 出场时间（需 FBref 入库） |

每项含：`id`, `nameCn`, `nameEn`, `position`, `avatarUrl`, `fantasyPrice`, `powerRating`, **`marketValue`**, **`marketValueCurrency`**（默认 `EUR`）, `team`。

不传 `competitionId` 时按库内该赛事出现过的球队聚合球员（可能较杂，建议传 `competitionId`）。

### 3.2 单球员

```http
GET /players/:id/summary
```

含 `avatarUrl`、`marketValue`、`marketValueCurrency`、`fantasyPrice`、`powerRating` 等。

### 3.3 数据来源（运维）

| 字段 | 主要来源 |
|------|----------|
| `avatarUrl` | API-Football 名单同步（`profile.apiFootball` / `Player.avatarUrl`） |
| `marketValue` | Football-Data **大名单** ingest → `profile.fdSquad.raw.marketValue`（欧）；AF 名单**不保证**身价 |

后台等价操作：运维中心「同步球员名单」或 `scripts/sync-league-squads.ts`（与 Admin 表单同源）。身价需另跑 FD squad ingest（见 Admin「球员数据」页）。

---

## 4. curl 验收

```bash
API=https://oaifjhzmpswi.sealosbja.site

curl -sS "$API/leagues/standings?codes=PL&season=2025&source=api_football" | jq '.success, .data.leagues[0].rows | length'

curl -sS "$API/rankings/players?competitionId=seed-comp-pl&metric=powerRating&limit=5" | jq '.data.items[0] | {nameCn, avatarUrl, marketValue}'
```

部署后若 `leagues` 返回 404，说明 API 尚未发布含 `LeaguesModule` 的版本。

---

## 5. 相关文档

- [Web比赛详情对接说明.md](./Web比赛详情对接说明.md)  
- [docs/比赛数据管线运维说明.md](./docs/比赛数据管线运维说明.md)  
- [API接口对接文档-完整版.md](./API接口对接文档-完整版.md) §2
