# ADR-0001: C 端 API v2 路径前缀

**状态**：已采纳  
**日期**：2026-06-22

## 背景

《后端开发架构指南最终版》§9 约定 `GET /api/v2/matches/:matchId/detail` 为主接口；现网已实现 `GET /matches/:id/detail-v2`。

## 决策

1. **主路径**：`/api/v2/matches|leagues|teams|players/...`
2. **兼容**：保留 `/matches/:id/detail-v2` 至少 90 天，响应等价，HTTP 头 `Deprecation: true`，`Link: </api/v2/matches/{id}/detail>`
3. **不**使用全局 `setGlobalPrefix('api')`，避免破坏 `/orders`、`/auth` 等现有路由
4. **解锁**：`POST /api/v2/matches/:matchId/unlock` 代理现有 `OrdersService.createForMatch`

## B4/B5

- B4 数据不进 detail 主包；独立 `/api/v2/teams|players/...`
- B5 赛中赔率：`MatchOddsLiveSnapshot` 时间序列；仅解锁/会员在 `paidModules.odds.liveSnapshots` 可见

## 后果

- 前端以 `/api/v2` 为契约主路径
- OpenAPI 与对接文档以 v2 章节为准
