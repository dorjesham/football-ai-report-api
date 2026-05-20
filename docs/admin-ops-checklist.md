# 运维值班清单（简版）

详见 [admin-ops-console-v4.md](./admin-ops-console-v4.md)。

## 每天早晨

1. 运营驾驶舱：系统状态、待办、配额
2. 日常运维 → 补未开赛（`scheduled_pre_match_bootstrap`）
3. AI 审核发布：处理 DRAFT/REVIEW

## 比赛日

1. 日常运维 → 同步赛中（`live_match_enrich`）
2. 必要时 `live_bootstrap` 修正假 LIVE

## 赛后

1. `finished_post_match_bootstrap`
2. 审核并发布 POST_MATCH AI

## 新库

按后台「首次装数据」五步执行，任务进度在「任务中心」查看。
