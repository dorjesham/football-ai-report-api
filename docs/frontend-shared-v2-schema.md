<!-- 内部片段：两本《完整版》文档 §6 共用，勿单独交付前端 -->

## match-detail-v2 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `schema` | `"match-detail-v2"` | 固定 |
| `matchId` | string | cuid |
| `fixtureId` | number \| null | AF fixture id |
| `status` | `SCHEDULED` \| `LIVE` \| `FINISHED` 等 | 比赛状态 |
| `serverTime` | ISO string | 服务端时间 |
| `isUnlocked` | boolean | 当前 viewer 是否视为已解锁 |
| `access` | `MatchAccess` | 权限矩阵，见下 |
| `basic` | object | 比分、主客队、赛事、开球时间等 |
| `freeModules` | object | 免费模块 |
| `paidModules` | object | 付费模块（含 locked） |
| `availability` | object | AF bundle 各端点覆盖状态 |
| `paywall` | object | 解锁价、文案、权益列表 |
| `updatedAt` | object | bundle 等更新时间 |

## MatchAccess.permissions（节选）

| 权限键 | 未解锁 SCHEDULED | 已解锁/会员 |
|--------|------------------|-------------|
| `injuries` | true | true |
| `lineups` | true | true |
| `predictions` | false | true |
| `odds` | false | true |
| `aiReports` | false | true |
| `tacticalScript` | false | true |
| `playerIntelligence` | false | true |

完赛且 `FINISHED_FREE_ALL=true`：登录用户可视为已解锁（见服务端配置）。

## paidModules 单项（PaidModuleDto）

```typescript
type PaidModuleDto = {
  locked: boolean;       // true 时 data 必为 null
  available: boolean;    // 库内是否有数据（非 missing）
  hasData?: boolean;
  status?: 'present' | 'empty' | 'missing';
  title: string;
  description?: string;
  source?: 'api-football' | 'deepseek';
  data?: unknown | null;
};
```

## paidModules.odds.data（仅 locked=false 且 hasData 时）

```typescript
type OddsModuleData = {
  latest: unknown;  // bundle.oddsLatestJson
  prematchSnapshots: Array<{
    phase: 'T24' | 'T1';
    capturedAt: string;
    markets: unknown;
  }>;
  liveSnapshots: Array<{
    capturedAt: string;
    markets: unknown;
  }>;
  disclaimer: string;  // 非投注建议文案
};
```

## match-access-v1（GET /api/v2/matches/:id/access）

```json
{
  "schema": "match-access-v1",
  "matchId": "cmpbfd6f901lap201oypcx4se",
  "serverTime": "2026-05-19T12:00:00.000Z",
  "isUnlocked": false,
  "access": { "...": "同 detail.access" },
  "paywall": {
    "unlockType": "single_match",
    "unlockPrice": { "amountCents": 690, "currency": "CNY", "display": "¥6.90" },
    "price": 690,
    "currency": "CNY"
  }
}
```

## 游客 detail 节选

```json
{
  "schema": "match-detail-v2",
  "isUnlocked": false,
  "paidModules": {
    "predictions": { "locked": true, "hasData": true, "data": null },
    "odds": { "locked": true, "hasData": true, "data": null }
  },
  "freeModules": {
    "injuries": { "available": true, "data": [{ "type": "Missing", "reason": "..." }] }
  }
}
```
