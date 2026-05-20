/** UI labels aligned with backend schema (v4 glossary). */

export const BUNDLE_LABELS: Record<string, string> = {
  catalog: '校验目录',
  fixtures_core: '同步五大联赛赛程',
  fixtures_worldcup: '同步世界杯赛程',
  squads_core: '同步球员名单',
  standings: '物化积分榜',
  leaderboards: '积分榜 + 射手榜',
  facts_finished: '已完赛事实包',
  live_bootstrap: '刷新比分并修正假 LIVE',
  injuries_upcoming: '物化近窗伤停',
  af_match_raw_full: '单场 AF Raw 全量',
  scheduled_pre_match_bootstrap: '补全近10天未开赛详情',
  live_match_enrich: '同步进行中比赛的赛中数据',
  finished_post_match_bootstrap: '补全已结束比赛详情',
  full_initial: '一键初始入库',
  worldcup_af_full_bootstrap: '世界杯 AF 全量 Bootstrap',
};

export const JOB_KIND_LABELS: Record<string, string> = {
  worldcup_af_full_bootstrap: '世界杯 AF 全量',
  worldcup_match_reconcile: '世界杯单场补全',
  worldcup_predictions_generate: '世界杯批量预测',
  worldcup_ai_drafts_generate: '世界杯 AI 草稿',
  worldcup_team_profile_refresh: '世界杯球队档案',
};

export function bundleLabel(bundleId: string | null, kind?: string): string {
  if (bundleId && BUNDLE_LABELS[bundleId]) return BUNDLE_LABELS[bundleId];
  return bundleId || kind || '—';
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  SUCCESS: '成功',
  SUCCEEDED: '成功',
  PARTIAL_SUCCESS: '部分成功',
  FAILED: '失败',
  CANCELED: '已取消',
};

export function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status] ?? status;
}

export const REPORT_STATUS_LABELS: Record<string, string> = {
  GENERATING: '生成中',
  READY: '待发布',
  NONE: '未生成',
  DRAFT: '待审核（草稿）',
  REVIEW: '待审核（复核）',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

export function reportStatusLabel(status: string): string {
  return REPORT_STATUS_LABELS[status] ?? status;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: '已创建',
  PAYING: '支付中',
  PAID: '已支付',
  CLOSED: '已关闭',
  FAILED: '失败',
  REFUNDED: '已退款',
};

export const COVERAGE_KEY_LABELS: Record<string, string> = {
  fixture: '赛程基础',
  lineups: '阵容',
  events: '进球过程',
  statistics: '技术统计',
  players: '球员统计',
  injuries: '伤停',
  predictions: '赛前预测',
  oddsLatest: '赔率',
  h2h: '交锋',
  homeCoach: '主队教练',
  awayCoach: '客队教练',
  homeTeamStats: '主队统计',
  awayTeamStats: '客队统计',
  homeSquad: '主队名单',
  awaySquad: '客队名单',
};

export function coverageKeyLabel(key: string): string {
  return COVERAGE_KEY_LABELS[key] ?? key;
}

export type AfAvailabilityStatus =
  | 'present'
  | 'empty'
  | 'missing'
  | 'stale'
  | 'error'
  | string;

export function coverageStatusClass(
  status: AfAvailabilityStatus,
): 'ok' | 'warn' | 'err' | 'muted' {
  if (status === 'present') return 'ok';
  if (status === 'empty' || status === 'stale') return 'warn';
  if (status === 'missing' || status === 'error') return 'err';
  return 'muted';
}

export const HELP_TEXTS: Record<string, string> = {
  coverage:
    '数据健康：绿=已有数据，黄=空或略旧，红=缺失或拉取失败。来自 MatchAfRawBundle。',
  published:
    'PUBLISHED：C 端详情页可见。同场同类型仅一份 PUBLISHED（publishedKey 唯一）。',
  partialSuccess:
    'PARTIAL_SUCCESS：批量任务中部分场次成功、部分失败。请到任务详情查看失败场次。',
  bundle: 'Bundle：预定义的批量入库流程，会创建 IngestJobRun 任务记录。',
  apiQuota: 'API-Football 每日配额。接近耗尽时请减少批量同步频率。',
  inputHash: 'inputHash：AI 生成时输入数据的哈希，用于判断是否需要重新生成。',
};
