import { API_FOOTBALL_DEFAULT_CODES } from '../api-football/api-football.constants';

export type IngestBundleId =
  | 'catalog'
  | 'fixtures_core'
  | 'fixtures_worldcup'
  | 'squads_core'
  | 'standings'
  | 'leaderboards'
  | 'facts_finished'
  | 'live_bootstrap'
  | 'injuries_upcoming'
  | 'full_initial'
  | 'finished_post_match_bootstrap'
  | 'scheduled_pre_match_bootstrap'
  | 'live_match_enrich'
  | 'af_match_raw_full'
  | 'worldcup_af_full_bootstrap';

export type IngestBundleStep = {
  id: string;
  label: string;
};

export type IngestBundleDef = {
  id: IngestBundleId;
  title: string;
  description: string;
  steps: IngestBundleStep[];
};

export const INGEST_BUNDLES: Record<IngestBundleId, IngestBundleDef> = {
  catalog: {
    id: 'catalog',
    title: '校验目录',
    description: '检查 Tournament / Competition / Season 是否已 seed',
    steps: [{ id: 'verify', label: '校验种子目录' }],
  },
  fixtures_core: {
    id: 'fixtures_core',
    title: '同步五大联赛 + 欧战赛程',
    description: 'API-Football fixtures 全赛季分页写入 Match（af-f-*）',
    steps: [{ id: 'fixtures', label: '拉取赛程' }],
  },
  fixtures_worldcup: {
    id: 'fixtures_worldcup',
    title: '同步世界杯赛程',
    description: 'league=1 season=2026',
    steps: [{ id: 'fixtures_wc', label: '世界杯赛程' }],
  },
  squads_core: {
    id: 'squads_core',
    title: '同步球员名单',
    description: '各联赛当前 season 球员写入 Player（af-p-*）',
    steps: [{ id: 'squads', label: '球员名单' }],
  },
  standings: {
    id: 'standings',
    title: '物化积分榜',
    description: '五大联赛 + 欧战 + 世界杯（多小组）→ CompetitionStanding',
    steps: [{ id: 'standings', label: '积分榜入库' }],
  },
  leaderboards: {
    id: 'leaderboards',
    title: '积分榜 + 射手榜物化',
    description: 'CompetitionStanding + PlayerSeasonMetric（含 WC season=2026）',
    steps: [
      { id: 'standings', label: '积分榜' },
      { id: 'topscorers', label: '射手榜' },
    ],
  },
  facts_finished: {
    id: 'facts_finished',
    title: '已完赛事实包',
    description: 'lineups / events / statistics → MatchFacts',
    steps: [{ id: 'facts', label: '完赛 enrich' }],
  },
  live_bootstrap: {
    id: 'live_bootstrap',
    title: '刷新比分并修正假 LIVE',
    description: '近窗 AF 轮询 + 状态对账',
    steps: [
      { id: 'poll', label: '近窗比分轮询' },
      { id: 'reconcile', label: '假 LIVE 修正' },
    ],
  },
  injuries_upcoming: {
    id: 'injuries_upcoming',
    title: '物化近窗伤停',
    description: '写入 MatchFacts.injuriesJson',
    steps: [{ id: 'injuries', label: '伤停同步' }],
  },
  worldcup_af_full_bootstrap: {
    id: 'worldcup_af_full_bootstrap',
    title: '世界杯 AF 全量 Bootstrap',
    description:
      'WC 专用 16 步：目录校验 → 赛程/球队/名单 → 中文种子/回填 → 单场 sync-full → 快照 → AF 预测 → 天气 → coverage（AI 草稿默认跳过）',
    steps: [
      { id: 'catalog_verify', label: '校验目录' },
      { id: 'fixtures_wc', label: '世界杯赛程' },
      { id: 'teams_af', label: 'AF 球队入库' },
      { id: 'squads_wc', label: '球员名单' },
      { id: 'standings_wc', label: '积分榜' },
      { id: 'leaderboards_wc', label: '射手榜' },
      { id: 'team_profiles_wc', label: '球队档案' },
      { id: 'zh_seed_apply', label: '中文种子导入' },
      { id: 'localization_backfill_wc', label: '世界杯中文回填' },
      { id: 'zh_coverage_report', label: '中文覆盖率' },
      { id: 'matches_sync_full', label: '单场 AF 全量' },
      { id: 'matches_pre_match_snapshot', label: '赛前快照' },
      { id: 'matches_prediction_af', label: 'AF 预测' },
      { id: 'matches_weather_t24', label: '天气 T24' },
      { id: 'matches_ai_draft', label: 'AI 草稿（可选）' },
      { id: 'coverage_report', label: '覆盖度报告' },
    ],
  },
  af_match_raw_full: {
    id: 'af_match_raw_full',
    title: '单场 AF Raw 全量',
    description: '近窗 SCHEDULED 场次写入 MatchAfRawBundle（predictions/odds/injuries 等）',
    steps: [{ id: 'af_raw_full', label: 'Raw bundle 同步' }],
  },
  scheduled_pre_match_bootstrap: {
    id: 'scheduled_pre_match_bootstrap',
    title: '补全近10天未开赛详情',
    description:
      '对未来10天内开球的 SCHEDULED 场次：AF 赛前快照、T24/T1 赔率、单场 sync-full（MatchAfRawBundle）、可选 PRE_MATCH AI 草稿（不自动发布），并刷新详情缓存。任务较长，请到「任务中心」看进度。',
    steps: [
      { id: 'snapshot', label: '正在同步赛前快照' },
      { id: 'odds', label: '正在采集赔率快照' },
      { id: 'af_raw_sync', label: '正在同步 AF Raw 全量' },
      { id: 'ai_draft', label: '正在生成 AI 草稿' },
      { id: 'cache', label: '正在刷新详情页缓存' },
    ],
  },
  live_match_enrich: {
    id: 'live_match_enrich',
    title: '赛中数据增强',
    description:
      '对当前 LIVE 的 af-f-* 场次同步 events/statistics/球员统计与时间轴（不跑 intel-full）。',
    steps: [
      { id: 'live_facts', label: '赛中事件与统计' },
      { id: 'live_players', label: '球员单场统计' },
    ],
  },
  finished_post_match_bootstrap: {
    id: 'finished_post_match_bootstrap',
    title: '补全已结束比赛的详情页',
    description:
      '给已经踢完的比赛依次补上：进球过程、开赛前胜负猜测、猜对没有、赛后短评，并让用户打开比赛页就能看到。任务较长，请到「任务中心」看进度。不会生成战术/天气长文。',
    steps: [
      { id: 'facts', label: '正在拉进球过程和比分细节' },
      { id: 'predictions', label: '正在补「谁会赢」的猜测' },
      { id: 'lock', label: '正在固定开赛前的那份猜测' },
      { id: 'grading', label: '正在核对猜对还是猜错' },
      { id: 'post_match', label: '正在写赛后短评' },
      { id: 'publish', label: '正在把短评放到用户能看到的页面' },
    ],
  },
  full_initial: {
    id: 'full_initial',
    title: '一键初始入库（推荐）',
    description: '目录 → 赛程 → 名单 → 积分榜+射手榜 → 完赛 facts → 比分修正',
    steps: [
      { id: 'verify', label: '校验目录' },
      { id: 'fixtures', label: '核心赛程' },
      { id: 'fixtures_wc', label: '世界杯赛程' },
      { id: 'squads', label: '球员名单' },
      { id: 'standings', label: '积分榜' },
      { id: 'topscorers', label: '射手榜' },
      { id: 'facts', label: '完赛 facts' },
      { id: 'poll', label: '比分轮询' },
      { id: 'reconcile', label: '状态对账' },
      { id: 'injuries', label: '伤停' },
    ],
  },
};

export const CORE_FIXTURE_CODES = [...API_FOOTBALL_DEFAULT_CODES] as string[];

export function isIngestBundleId(id: string): id is IngestBundleId {
  return id in INGEST_BUNDLES;
}
