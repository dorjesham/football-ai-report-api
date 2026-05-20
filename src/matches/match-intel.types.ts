/**
 * C 端赛前情报聚合读模型（Phase A + Phase B 扩展字段）。
 * 与产品线框章节对应；未解锁时 detail 类字段为 null，preview/teaser 仍返回。
 */

import type {
  FantasyLineupLaboratory,
  RefereeLeagueBenchmark,
  RefereeTeamRefSample,
  VenueHistoricalContext,
} from './schemas/phase-b-intel.zod';

export const MATCH_INTEL_SCHEMA_VERSION = 1 as const;

export interface MatchIntelMeta {
  schemaVersion: typeof MATCH_INTEL_SCHEMA_VERSION;
  matchId: string;
  /** 管理员；或已登录且（已完赛免费开放全量，或已购买本场解锁） */
  isUnlocked: boolean;
  isAdminViewer: boolean;
  /**
   * 自开球经过分钟数 + 「LIVE 但可能已完赛、等库翻 FINISHED」提示。
   * 权威状态以 **`GET /matches/:id` 的 `match.status`** 为准；本字段仅辅助轮询与 UI（勿单独用分钟数顶死「90'」）。
   */
  liveStatusSyncHint?: MatchIntelLiveStatusSyncHint | null;
  statusCn?: string | null;
}

/** 与 `computeLiveStatusSyncHint` 对齐；不替代 Prisma `MatchStatus`。 */
export interface MatchIntelLiveStatusSyncHint {
  elapsedMinutesSinceKickoff: number;
  likelyAwaitingFinishedTransition: boolean;
}

export interface MatchIntelHeader {
  isFeatured: boolean;
  competitionNameCn: string | null;
  competitionCode: string | null;
  roundLabel: string | null;
  seasonCode: string | null;
  tournamentNameCn: string | null;
}

export interface MatchIntelVenue {
  stadium: string | null;
  city: string | null;
  country: string | null;
  kickoffTime: string;
}

export interface MatchIntelScore {
  home: number | null;
  away: number | null;
}

export interface MatchIntelTeamSnapshot {
  leagueRank: number | null;
  points: number | null;
  recentForm: string | null;
  goalsForAvg: number | null;
  goalsAgainstAvg: number | null;
  xgAvg: number | null;
  xgaAvg: number | null;
  attackRating: number;
  defenseRating: number;
  dataQuality: string;
  dataSource: string;
}

export type TranslationStatus = 'approved' | 'draft' | 'fallback';

export interface MatchIntelTeamBlock {
  side: 'home' | 'away';
  teamId: string;
  nameCn: string;
  nameEn: string | null;
  displayName: string;
  translationStatus: TranslationStatus;
  logoUrl: string | null;
  /**
   * OLS 本场基础 TPR（与胜率模型一致的分项）。
   * 优先取本场 `MatchPrediction.factorBreakdown.ols.homeBaseTpr/awayBaseTpr`；
   * 无预测或因子缺失时回退 `Team.powerRating`（可能来自他场同步，仅作兜底）。
   */
  powerRating: number | null;
  /** 本场单场修正战力（主场/伤停/疲劳），与 `predictionPreview.homeMatchPower` 同源；无预测时为 null */
  matchPower: number | null;
  snapshot: MatchIntelTeamSnapshot | null;
}

export interface MatchIntelUnlockPrice {
  amountCents: number;
  currency: string;
  display: string;
  /** 焦点战加价档（V2 ¥9.9） */
  tier?: 'standard' | 'featured';
}

export interface MatchIntelFreeLayer {
  freeSummary: string;
  unlockPrice: MatchIntelUnlockPrice;
  /** 未解锁时仍返回，供免费区「模型一瞥」；已解锁时与 paid.dashboard.preview 一致 */
  predictionPreview: MatchIntelPredictionPreview | null;
  postMatchTeaser?: MatchIntelPhaseReportTeaser | null;
  liveNarrativeTeaser?: MatchIntelPhaseReportTeaser | null;
}

/** 未解锁即可见的预测摘要（与既有 predictionPreview 对齐） */
export interface MatchIntelPredictionPreview {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  totalExpectedGoals: number;
  totalGoalsTrend: string | null;
  tempoIndex: number;
  upsetIndex: number;
  /** OLS 单场战力（含主场/伤停等），无预测时为 null */
  homeMatchPower: number | null;
  awayMatchPower: number | null;
  confidence: number;
  dataQuality: string;
}

export interface MatchIntelPredictionDetail extends MatchIntelPredictionPreview {
  modelVersion: string;
  factorBreakdown: unknown | null;
  explanation: string | null;
  dataSource: string;
  version?: number;
  lockedAt?: string | null;
  predictionMarkets?: unknown | null;
}

export interface MatchIntelDashboard {
  hasModel: boolean;
  preview: MatchIntelPredictionPreview | null;
  detail: MatchIntelPredictionDetail | null;
}

export interface MatchIntelRefereeRef {
  id: string;
  nameCn: string;
  nameEn: string | null;
  displayName: string;
  translationStatus: TranslationStatus;
  /** 头像 URL（库内或手工映射） */
  avatarUrl: string | null;
  country: string | null;
}

export interface MatchIntelRefereeStats {
  matchesCount: number | null;
  yellowCardsAvg: number | null;
  redCardsAvg: number | null;
  penaltiesAvg: number | null;
  foulsAvg: number | null;
  homeWinRate: number | null;
  addedTimeAvg: number | null;
  notes: string | null;
  dataQuality: string;
  dataSource: string;
}

/** 裁判矩阵：人物 + 本场快照 + Phase B 联赛对照与分队伍样本 */
export interface MatchIntelRefereeBlock {
  referee: MatchIntelRefereeRef | null;
  stats: MatchIntelRefereeStats | null;
  leagueBenchmarks: RefereeLeagueBenchmark | null;
  homeTeamRefHistory: RefereeTeamRefSample | null;
  awayTeamRefHistory: RefereeTeamRefSample | null;
}

export interface MatchIntelWeather {
  temperature: number | null;
  condition: string | null;
  humidity: number | null;
  windSpeed: number | null;
  visibility: number | null;
  pitchCondition: string | null;
  weatherImpactScore: number;
  dataQuality: string;
  dataSource: string;
  /** Phase B：主场历史同期 / 同月等 */
  venueHistorical: VenueHistoricalContext | null;
}

export interface MatchIntelPlayerRow {
  playerId: string;
  teamId: string;
  nameCn: string;
  nameEn: string | null;
  displayName: string;
  translationStatus: TranslationStatus;
  avatarUrl: string | null;
  /** OLS 球员 PPR */
  powerRating: number | null;
  teamNameCn: string | null;
  statusTag: string | null;
  startProbability: number | null;
  riskLevel: string;
  aiSummary: string | null;
  fitnessAnalysis: string | null;
  psychologyAnalysis: string | null;
  matchupAnalysis: string | null;
  weatherImpact: string | null;
  fantasySuggestion: string | null;
}

export interface MatchIntelTactic {
  id: string;
  scenarioType: string;
  title: string;
  probability: number;
  precondition: string;
  process: string;
  possibleScore: string | null;
  timeline: string | null;
}

export interface MatchIntelFantasy {
  captainRecommendation: string | null;
  mustHave: unknown;
  valuePicks: unknown;
  avoid: unknown;
  predictedPoints: unknown;
  riskWarnings: unknown;
  /** Phase B：三套阵容实验室（校验通过才返回，否则 null） */
  lineupLaboratory: FantasyLineupLaboratory | null;
  dataQuality: string;
  dataSource: string;
}

export interface MatchIntelHeadToHead {
  lastMeetingsCount: number | null;
  homeWins: number | null;
  draws: number | null;
  awayWins: number | null;
  avgGoals: number | null;
  summary: string | null;
  homeAdvantageText: string | null;
  cardsText: string | null;
  cornersText: string | null;
  rawStats: unknown;
  dataQuality: string;
  dataSource: string;
}

export interface MatchIntelSocial {
  oneLiner: string;
  shareCopy: string | null;
  shortVideoScript: string | null;
  posterTitle: string | null;
  posterImageUrl: string | null;
  momentsCopy: string | null;
  xiaohongshuTitle: string | null;
}

export interface MatchIntelReportSlice {
  id: string;
  status: string;
  reportType?: string;
  modelName: string | null;
  dashboardSummary: string | null;
  historicalInsight: string | null;
  refereeAnalysis: unknown;
  weatherAnalysis: unknown;
  expertVariables: unknown;
  generatedAt: string;
  publishedAt: string | null;
}

/** 赛后/叙事报告 teaser（已发布或管理员可见草稿） */
export interface MatchIntelPhaseReportTeaser {
  id: string;
  reportType: 'POST_MATCH' | 'LIVE_NARRATIVE';
  status: string;
  freeSummary: string;
  dashboardSummary: string | null;
  predictionId: string | null;
  publishedAt: string | null;
}

export interface MatchIntelPaidBundle {
  dashboard: MatchIntelDashboard;
  referee: MatchIntelRefereeBlock | null;
  weather: MatchIntelWeather | null;
  /** 至多 6 人，按首发概率降序 */
  keyPlayers: MatchIntelPlayerRow[];
  /** 至多 3 条剧本，按 probability 降序 */
  tactics: MatchIntelTactic[];
  fantasy: MatchIntelFantasy | null;
  headToHead: MatchIntelHeadToHead | null;
  social: MatchIntelSocial | null;
  report: MatchIntelReportSlice | null;
}

export interface MatchIntelResponse {
  meta: MatchIntelMeta;
  header: MatchIntelHeader;
  venue: MatchIntelVenue;
  score: MatchIntelScore;
  teams: {
    home: MatchIntelTeamBlock;
    away: MatchIntelTeamBlock;
  };
  freeLayer: MatchIntelFreeLayer;
  disclaimer: string;
  /** 未解锁且非管理员时，仅含 dashboard.preview 等 teaser；各 detail 为 null */
  paid: MatchIntelPaidBundle | null;
}
