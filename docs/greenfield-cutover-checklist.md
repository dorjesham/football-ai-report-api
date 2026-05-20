# 新库切流验收勾选表

对照 [greenfield-cutover-master-plan.md](./greenfield-cutover-master-plan.md) §十六。维护窗口内逐项打勾。

## 切库前（代码）

- [ ] 空库 `npx prisma migrate deploy` 全绿（含 `20260625120000_greenfield_cutover`）
- [ ] `npm run build && npm run test:ci && npm run build:admin`
- [ ] `intel-full` / 战术长文 / 旧预测同步返回 **410** `LEGACY_PIPELINE_RETIRED`
- [ ] C 端 detail-v2 仅展示 `PUBLISHED` 的 `PRE_MATCH` AiReport
- [ ] `POST /admin/api/ai/reports/:id/publish` 同场同类型仅一条 `PUBLISHED`
- [ ] `GET /admin/api/matches/:matchId/ops-status` 可用
- [ ] 任务中心 `GET /admin/api/ingest/jobs/:id` 含 `items[]`
- [ ] `scheduled_pre_match_bootstrap` 使用 sync-full，非 intel-full

## 维护窗口（运维）

- [ ] 备份旧库
- [ ] 创建新库 `football_ai_v2`，更新 `DATABASE_URL`
- [ ] **禁止**对旧库执行 `migrate deploy` / `resolve`
- [ ] `npx prisma migrate deploy && npx prisma db seed`
- [ ] 发布 API + admin-web，核对 §十四 env
- [ ] 灌数 A→F：`full_initial` → `scheduled_pre_match_bootstrap` → catalog → `finished_post_match_bootstrap` → live tick → `acceptance-pre-match-unlocked.sh`
- [ ] 重选 `ACCEPTANCE_MATCH_ID`（须已灌数）

## 签字

| 角色 | 姓名 | 日期 |
|------|------|------|
| 开发 | | |
| 运维 | | |
