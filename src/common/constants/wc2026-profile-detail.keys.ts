/**
 * 世界杯国家队展示扩展字段（`Team.wc2026Profile` 内 + `Team.founded`）。
 * 与 `wc2026_team_detail_overrides.json`、import 合并、管理端 PATCH 共用。
 */
export const WC2026_PROFILE_DETAIL_KEYS = [
  'marketingSummary',
  'aiInsight',
  'contentVersion',
  'headCoachName',
  'qualificationLabel',
  'regionDisplayName',
  'keyPlayers',
  'tacticalTags',
  'tacticalPitch',
  'aiPowerScore',
  /** API-Football `/teams/statistics` 等自动写入的结构化快照（可较大，ingest 内会控制体积） */
  'apiFootballTeamStats',
  /** 由 API 统计字段自动生成的中文「历史底蕴/赛前线索」摘要（非博彩、非赛果承诺） */
  'historicalHeritageZh',
  /** `/teams?id=` 返回的队徽、国家、成立年等卡片信息（便于与 seed 数据互补） */
  'apiFootballTeamCard',
] as const;

export type Wc2026ProfileDetailKey = (typeof WC2026_PROFILE_DETAIL_KEYS)[number];
