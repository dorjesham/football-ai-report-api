# Redis 与边缘缓存（CDN 头）

## 目标

- **Redis**：为高频只读接口做读穿缓存，减轻数据库压力；未配置 Redis 时自动降级，不影响启动。
- **CDN / 浏览器**：对可匿名缓存的 `GET` 响应写入 `Cache-Control`（`public` + `s-maxage` + `stale-while-revalidate`）；对带 `Authorization: Bearer` 的比赛情报/详情写入 `private, no-store`，避免边缘节点把会员态响应缓存给其他人。

## 环境变量

见项目根目录 `.env.example` 中「Redis 读缓存」「CDN / 浏览器缓存头」段落，对应 `src/config/configuration.ts` 中的键名。

## Redis 键约定

| 逻辑键模式 | 说明 |
|-----------|------|
| `matches:list:<hash>` | 比赛列表，`hash` 为查询参数稳定序列化 |
| `matches:intel:anon:<matchId>` | 匿名情报 |
| `matches:intel:user:<userId>:<matchId>` | 登录用户情报 |
| `matches:detail:anon:<matchId>` / `matches:detail:user:...` | 详情同理 |
| `tournaments:list:<hash>` | 赛事列表 |
| `tournaments:code:<code>` | 单个赛事 |
| `tournaments:comps:<code>` | 某赛事下竞赛 |
| `tournaments:matches:<code>` | 某赛事下比赛列表 |

实际键名带 `REDIS_KEY_PREFIX`（默认 `football:`）。

## 失效

- **赛事实体变更**（管理端 `PATCH /matches/:id`、替换球队/球员快照）：删除本场次匿名与全用户维度的情报/详情键、`matches:list:*`，以及对应赛事的 `tournaments:matches:<code>`（`MatchCacheInvalidationService.invalidateAfterMatchDataChange`）。
- **微信支付成功回调**：事务提交后，若订单为 **单场报告解锁**（`REPORT_UNLOCK` / `FEATURED_REPORT_UNLOCK`）且带 `matchId`，调用 `invalidateUserMatchUnlock(userId, matchId)`，仅删该用户本场次用户态缓存；若为 **Pro 会员**（月/季/年），调用 `invalidateAllUserMatchCaches(userId)`，按用户清理其下已缓存的情报/详情键（会员对全场生效）。

## 代码入口

- `src/redis/redis.module.ts`、`redis.service.ts`
- `src/common/interceptors/cdn-cache-headers.interceptor.ts`（挂在 `MatchesController`、`TournamentsController`、`OrdersController`）
- `src/matches/match-cache-invalidation.service.ts`（赛事实体变更 + 支付后失效）
- `MatchesService` / `TournamentsService` 内读穿缓存；`WxpayService.handleNotify` 在支付成功后调用失效服务

## 注意

- 缓存内容为 JSON 序列化结果，日期字段为 ISO 字符串，与经 HTTP 返回的 JSON 形态一致。
- **管理员**查看情报不走 Redis 读缓存（避免草稿与线上态混淆）。
- 正确性仍以数据库为准；Redis 仅作 TTL 内的加速层。
