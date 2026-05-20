#!/usr/bin/env python3
"""Generate Web / 小程序 frontend integration docs from API mother doc."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
mother = (ROOT / "API接口对接文档-完整版.md").read_text(encoding="utf-8")
schema = (ROOT / "docs/frontend-shared-v2-schema.md").read_text(encoding="utf-8")
schema = schema.replace(
    "<!-- 内部片段：两本《完整版》文档 §6 共用，勿单独交付前端 -->\n\n", ""
)


def extract_between(text: str, start: str, end: str) -> str:
    i = text.find(start)
    j = text.find(end, i)
    return text[i:j].strip() if i >= 0 and j > i else ""


s21 = extract_between(mother, "### 2.1 公开", "### 2.2 需 JWT")
s22 = extract_between(mother, "### 2.2 需 JWT", "### 2.3 关键业务")
s24 = extract_between(mother, "### 2.4 三页合同", "### 2.5.1")
s28 = extract_between(mother, "### 2.8 `GET /matches/:id/live/stream`", "---\n\n## 3.")

V2_TABLE = """### 5.1 API v2 路由全表

| METHOD | 路径 | 鉴权 | Query / Body | data 要点 | 前端注意 |
|--------|------|------|--------------|-----------|----------|
| GET | `/api/v2/matches/:matchId/detail` | 公开，可选 Bearer | — | `schema: match-detail-v2` | **详情主接口** |
| GET | `/api/v2/matches/:matchId/access` | 公开，可选 Bearer | — | `schema: match-access-v1` | 首屏轻量 |
| POST | `/api/v2/matches/:matchId/unlock` | JWT + 已绑手机 | — | 同 `POST /orders/matches/:matchId/create` | 解锁下单 |
| GET | `/api/v2/leagues/:code/standings` | 公开 | `season?` | 积分榜 | 未 sync → 404 |
| GET | `/api/v2/leagues/:code/topscorers` | 公开 | `season?` | 射手榜 | 同上 |
| GET | `/api/v2/leagues/:code/topassists` | 公开 | `season?` | 助攻榜 | 同上 |
| GET | `/api/v2/leagues/:code/topyellowcards` | 公开 | `season?` | 黄牌榜 | 同上 |
| GET | `/api/v2/leagues/:code/topredcards` | 公开 | `season?` | 红牌榜 | 同上 |
| GET | `/api/v2/leagues/:code/rounds` | 公开 | `season?` | 轮次 | 同上 |
| GET | `/api/v2/teams/:teamId/transfers` | 公开 | `season?` | 转会 | **不进 detail** |
| GET | `/api/v2/teams/:teamId/trophies` | 公开 | — | 荣誉 | 404=未同步 |
| GET | `/api/v2/players/:playerId/trophies` | 公开 | — | 球员荣誉 | 同上 |
| GET | `/api/v2/players/:playerId/sidelined` | 公开 | — | 缺阵史 | 同上 |
| GET | `/matches/:matchId/detail-v2` | 公开，可选 Bearer | — | 同 v2 detail | `Deprecation` + `Link` |

### 5.2 Legacy

新接入只用 `/api/v2/matches/:id/detail`；`detail-v2` 业务体等价。"""

UNLOCKED_JSON = """### 6.4 已解锁 detail 节选

```json
{
  "schema": "match-detail-v2",
  "isUnlocked": true,
  "paidModules": {
    "odds": {
      "locked": false,
      "hasData": true,
      "data": {
        "latest": {},
        "prematchSnapshots": [{ "phase": "T24", "capturedAt": "2026-05-18T10:00:00.000Z", "markets": {} }],
        "liveSnapshots": [{ "capturedAt": "2026-05-18T20:15:00.000Z", "markets": {} }],
        "disclaimer": "数据仅供参考，不构成投注建议。"
      }
    }
  }
}
```"""

TS_TYPES = """### 6.5 TypeScript 类型草案

```typescript
export interface PaidModuleDto {
  locked: boolean;
  available: boolean;
  hasData?: boolean;
  status?: 'present' | 'empty' | 'missing';
  title: string;
  data?: unknown | null;
}

export interface MatchDetailV2 {
  schema: 'match-detail-v2';
  matchId: string;
  fixtureId: number | null;
  status: string;
  serverTime: string;
  isUnlocked: boolean;
  access: Record<string, unknown>;
  basic: Record<string, unknown>;
  freeModules: Record<string, PaidModuleDto>;
  paidModules: {
    predictions: PaidModuleDto;
    odds: PaidModuleDto;
    aiReports: PaidModuleDto;
    tacticalScript: PaidModuleDto;
    playerIntelligence: PaidModuleDto;
  };
  paywall: Record<string, unknown>;
}
```"""

WEB_AUTH = """## 3. 鉴权与用户（Web）

### 3.1 微信扫码 OAuth

```mermaid
sequenceDiagram
  participant Web
  participant API
  participant WX as WeChat
  Web->>API: GET /auth/wechat/web/authorize?json=1
  API-->>Web: url, state
  Web->>WX: 打开 url
  WX->>API: callback
  API-->>Web: 302 ?accessToken=
  Web->>Web: localStorage
```

```typescript
const { url, state } = await api<{ url: string; state: string }>(
  '/auth/wechat/web/authorize?json=1',
);
sessionStorage.setItem('wx_oauth_state', state);
window.location.href = url;
```

### 3.2 邮箱注册 / 登录

`GET /auth/captcha` → `POST /auth/register` | `POST /auth/login`。

### 3.3 Token

`localStorage.setItem('accessToken', token)`；请求头 `Authorization: Bearer <token>`。

### 3.4 绑定手机

`AUTH_REQUIRE_VERIFIED_PHONE=true` 时下单需绑手机：`POST /auth/phone/send-code`（`purpose: bind`）→ `POST /auth/bind-phone`。

### 3.5 可选 Bearer

`/api/v2/matches/:id/detail` 等带 Token 时 `isUnlocked` / `paidModules.*.locked` 准确。

详见 [登录注册对接说明.md](./登录注册对接说明.md)。"""

MP_AUTH = """## 3. 鉴权与用户（小程序）

### 3.1 合法域名

微信公众平台 → 开发 → 开发管理 → 开发设置 → **服务器域名** → request 合法域名填 `{API_ORIGIN}` 的**主机名**（不含路径）。

### 3.2 wx.request 封装

```typescript
const apiOrigin = getApp().globalData.apiOrigin; // 如 https://oaifjhzmpswi.sealosbja.site

function request<T>(options: WechatMiniprogram.RequestOption): Promise<T> {
  const token = wx.getStorageSync('accessToken');
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${apiOrigin}${options.url}`,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.header,
      },
      success(res) {
        const body = res.data as { success?: boolean; data?: T; message?: string };
        if (res.statusCode >= 400 || body.success === false) {
          reject(new Error(body.message || String(res.statusCode)));
          return;
        }
        resolve((body.data ?? body) as T);
      },
      fail: reject,
    });
  });
}
```

### 3.3 wx.login + wechat-login

```typescript
async function wechatLogin() {
  const { code } = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>(
    (resolve, reject) => wx.login({ success: resolve, fail: reject }),
  );
  const data = await request<{ accessToken: string }>({
    url: '/auth/wechat-login',
    method: 'POST',
    data: { code },
  });
  wx.setStorageSync('accessToken', data.accessToken);
  return data;
}
```

### 3.4 绑定手机

同 Web：`send-code` → `bind-phone`；403 `PHONE_VERIFICATION_REQUIRED` 时引导绑手机。

### 3.5 可选 Bearer

详情 `GET /api/v2/matches/:id/detail` 建议始终带 Token（若已登录）。"""

WEB_PAY = """## 7. 订单与支付（Web）

| 方法 | 路径 |
|------|------|
| POST | `/api/v2/matches/:matchId/unlock`（推荐） |
| POST | `/orders/matches/:matchId/create` |
| GET | `/orders/:orderNo` |
| GET | `/orders/pricing` |

```typescript
const created = await api(`/api/v2/matches/${matchId}/unlock`);
if (created.payParams) await invokeWxJsapiPay(created.payParams);
for (let i = 0; i < 30; i++) {
  const order = await api(`/orders/${created.order.orderNo}`);
  if (order.status === 'PAID') break;
  await new Promise((r) => setTimeout(r, 2000));
}
await api(`/api/v2/matches/${matchId}/detail`);
```

**注意**：仅 Web 扫码、未 `bind-wechat` 的用户可能无 `openid`，无法 JSAPI。"""

MP_PAY = """## 7. 订单与支付（小程序）

| 方法 | 路径 |
|------|------|
| POST | `/api/v2/matches/:matchId/unlock` |
| GET | `/orders/:orderNo` |

```typescript
const created = await request({
  url: `/api/v2/matches/${matchId}/unlock`,
  method: 'POST',
});
if (created.payParams) {
  await new Promise<void>((resolve, reject) => {
    wx.requestPayment({ ...created.payParams, success: () => resolve(), fail: reject });
  });
}
// payParams 字段以 GET /orders/:orderNo 为准：timeStamp, nonceStr, package, signType, paySign
```

手机注册用户需先 `POST /auth/bind-wechat` 获取 `openid` 方可支付。"""

WEB_SSE = f"""## 10. 赛中 SSE（Web）

{s28}

```typescript
const es = new EventSource(
  `${{API_ORIGIN}}/matches/${{matchId}}/live/stream?lastSeq=${{lastSeq}}`,
);
es.onmessage = (ev) => {{
  const msg = JSON.parse(ev.data);
  if (msg.type === 'snapshot') setLive(msg.data);
  if (msg.type === 'live_patch') refetchLive();
}};
```

`EventSource` 无法带 Bearer；接口 `@Public()`。网关 `X-Accel-Buffering: no`。"""

MP_POLL = """## 10. 赛中数据（轮询）

小程序**不支持** `EventSource`，推荐：

| 策略 | 接口 | 间隔 |
|------|------|------|
| 三页合同 | `GET /matches/:id/live` | `meta.recommendedPollSec`（赛中约 10s） |
| 列表比分 | `GET /matches/:id` | 15–30s |
| v2 详情 | `GET /api/v2/matches/:id/detail` 刷新 `basic` | LIVE 缓存 TTL ~15s |

`live_patch` 仅作 SSE 信号；展示字段以 `match-live-v1` REST 为准。"""


def build_web() -> str:
    return f"""# Web 前端对接文档（完整版）

> **版本**：2026-06 · API v2 主路径  
> **读者**：H5 / Web SPA  
> **Base**：`{{API_ORIGIN}}`（示例：`https://oaifjhzmpswi.sealosbja.site`）  
> **小程序文档**：[小程序前端对接文档-完整版.md](./小程序前端对接文档-完整版.md)  
> **路由母本**：[API接口对接文档-完整版.md](./API接口对接文档-完整版.md)

---

## 0. 阅读指引

| § | 内容 |
|---|------|
| 1 | 环境与 Web 须知 |
| 2 | 统一响应 |
| 3 | 鉴权（OAuth / 密码） |
| 4 | C 端 API 全量清单 |
| 5 | API v2 |
| 6 | match-detail-v2 |
| 7 | 订单与支付 |
| 8 | me 域 |
| 9 | 联赛 / B4 |
| 10 | SSE |
| 11 | 页面序列 |
| 12 | 联调 |

**已合并**：[Web比赛详情对接说明.md](./Web比赛详情对接说明.md) → §6；[登录注册对接说明.md](./登录注册对接说明.md) → §3。

---

## 1. 环境与 Web 开发者须知

### 1.1 Base URL

- `{{API_ORIGIN}}/路径`，**无**全局 `/api` 前缀（**除** `/api/v2/...`）。
- Swagger：`{{API_ORIGIN}}/docs`（生产需 `ENABLE_SWAGGER_DOCS=true`）。
- 前端域须在 **CORS** 白名单（示例 `https://oovxhxiusmdy.sealosbja.site`）。

### 1.2 Web 与小程序差异

| 主题 | Web | 小程序 |
|------|-----|--------|
| 登录 | 微信扫码 OAuth、邮箱密码 | `wx.login` |
| Token | `localStorage` | `wx.storage` |
| 支付 | JSAPI（需 openid） | `wx.requestPayment` |
| 赛中 | **SSE** | 轮询 |
| 详情 | `GET /api/v2/matches/:id/detail` | 同左 |

### 1.3 禁止

- `/admin/*`、`/admin/api/*`；浏览器直连 `/football-feed/*`。
- 自造 `matchId`（须 cuid）。

---

## 2. 统一响应与错误处理

成功：`{{ "success": true, "data": {{}}, "message": "ok" }}`  
错误：`{{ "success": false, "message": "...", "errorCode": "..." }}`

```typescript
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {{
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {{
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }};
  if (token) headers.Authorization = `Bearer ${{token}}`;
  const res = await fetch(`${{API_ORIGIN}}${{path}}`, {{ ...init, headers }});
  const body = await res.json();
  if (!res.ok || body.success === false) throw new Error(body.message || res.statusText);
  return (body.data ?? body) as T;
}}
```

---

{WEB_AUTH}

---

## 4. C 端 API 全量清单

{s21}

{s22}

{s24}

---

## 5. API v2 专章

{V2_TABLE}

---

## 6. 比赛详情契约 `match-detail-v2`

{schema}

{UNLOCKED_JSON}

{TS_TYPES}

### 6.6 迁移

| 旧 | 新 |
|----|-----|
| intel + pre-match + odds | `GET /api/v2/.../detail` |
| `detail-v2` | `/api/v2/.../detail` |

---

{WEB_PAY}

---

## 8. 用户中心 `me` 域

见 §4.2：`/me/favorite-matches`、`/me/match-reminders`、`/me/preferences`、`/me/report-unlocks`、`/me/browse-history`、`/me/notifications` 等。  
**勿混用** `match-reminders`（开球提醒）与 `notifications`（消息中心）。

---

## 9. 联赛、榜单、B4

- v2：`GET /api/v2/leagues/PL/standings?season=2025`
- 球员榜：`GET /rankings/players?code=PL&metric=goals`（**禁止** `powerRating`，410）
- B4 子页：`/api/v2/teams/:id/transfers|trophies`、`/api/v2/players/:id/trophies|sidelined`

---

{WEB_SSE}

---

## 11. 页面级调用示例

### 11.1 比赛详情（v2）

```mermaid
sequenceDiagram
  participant Web
  participant API
  Web->>API: GET /api/v2/matches/:id/access
  Web->>API: GET /api/v2/matches/:id/detail
  alt 未解锁
    Web->>API: POST /api/v2/matches/:id/unlock
    Web->>API: GET /orders/:orderNo
    Web->>API: GET /api/v2/matches/:id/detail
  end
```

### 11.2 赛程列表

`GET /matches` + `GET /competitions/match-counts`。

### 11.3 球队档案

`GET /api/v2/teams/:teamId/transfers?season=` + `GET .../trophies`。

---

## 12. 联调验收

```bash
API=https://oaifjhzmpswi.sealosbja.site
MATCH_ID=cmpbfd6f901lap201oypcx4se
curl -sS "$API/api/v2/matches/$MATCH_ID/detail" | head -c 500
curl -sS "$API/api/v2/matches/$MATCH_ID/access" | head -c 300
curl -sS "$API/health"
curl -sS "$API/orders/pricing" | head -c 200
curl -sS -H "Authorization: Bearer $TOKEN" "$API/auth/me"
```

脚本：`scripts/acceptance-pre-match-unlocked.sh`。

**检查**：解析 `data`；未解锁 `paidModules.*.data === null`；v2 ≡ detail-v2。

**相关**：[docs/deploy-v2-sealos.md](./docs/deploy-v2-sealos.md)、[docs/adr/0001-api-v2-prefix.md](./docs/adr/0001-api-v2-prefix.md)
"""


MP_SECTION2 = """## 2. 统一响应与错误处理

成功：`{ "success": true, "data": {}, "message": "ok" }`  
错误：`{ "success": false, "message": "...", "errorCode": "..." }`

业务数据在 **`body.data`**（`success === true` 时）。完整 `request` 封装见 §3.2。"""


def build_mp() -> str:
    web = build_web()
    mp = web.replace("# Web 前端对接文档（完整版）", "# 小程序前端对接文档（完整版）")
    mp = mp.replace("**读者**：H5 / Web SPA", "**读者**：微信小程序")
    mp = mp.replace(
        "[小程序前端对接文档-完整版.md](./小程序前端对接文档-完整版.md)",
        "[Web前端对接文档-完整版.md](./Web前端对接文档-完整版.md)",
    )
    mp = mp.replace("小程序文档", "Web 文档")
    mp = mp.replace("## 1. 环境与 Web 开发者须知", "## 1. 环境与小程序开发者须知")
    mp = mp.replace("须在 **CORS** 白名单", "须配置 **request 合法域名**")
    mp = mp.replace("import.meta.env.VITE_API_ORIGIN", "getApp().globalData.apiOrigin")
    mp = mp.replace("localStorage.getItem", "wx.getStorageSync")
    mp = re.sub(
        r"## 3\. 鉴权与用户（Web）.*?(?=---\n\n## 4\.)",
        MP_AUTH + "\n\n",
        mp,
        flags=re.DOTALL,
    )
    mp = re.sub(
        r"## 7\. 订单与支付（Web）.*?(?=---\n\n## 8\.)",
        MP_PAY + "\n\n",
        mp,
        flags=re.DOTALL,
    )
    mp = re.sub(
        r"## 10\. 赛中 SSE（Web）.*?(?=---\n\n## 11\.)",
        MP_POLL + "\n\n",
        mp,
        flags=re.DOTALL,
    )
    mp = mp.replace("participant Web", "participant MP")
    mp = mp.replace("## 12. 联调验收", "## 12. 联调验收（小程序）")
    mp = mp.replace(
        "**已合并**：[Web比赛详情对接说明.md]",
        "**已合并**：[第一期前端对接规范文档.md](./第一期前端对接规范文档.md) §1–2；[Web比赛详情对接说明.md]",
    )
    mp = mp.replace("| 1 | 环境与 Web 须知 |", "| 1 | 环境与小程序须知 |")
    mp = mp.replace("| 3 | 鉴权（OAuth / 密码） |", "| 3 | wx.login / 绑手机 |")
    mp = mp.replace("| 10 | SSE |", "| 10 | 赛中轮询 |")
    mp = re.sub(
        r"## 2\. 统一响应与错误处理.*?(?=---\n\n## 3\.)",
        MP_SECTION2 + "\n\n",
        mp,
        flags=re.DOTALL,
    )
    return mp


def main() -> None:
    web = build_web()
    mp = build_mp()
    (ROOT / "Web前端对接文档-完整版.md").write_text(web, encoding="utf-8")
    (ROOT / "小程序前端对接文档-完整版.md").write_text(mp, encoding="utf-8")
    print(f"Web: {web.count(chr(10))} lines")
    print(f"MP:  {mp.count(chr(10))} lines")


if __name__ == "__main__":
    main()
