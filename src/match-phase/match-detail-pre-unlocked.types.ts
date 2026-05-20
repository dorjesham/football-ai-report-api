import type { MatchIntelPredictionPreview } from '../matches/match-intel.types';

export const MATCH_DETAIL_PRE_UNLOCKED_SCHEMA_V1 =
  'match-detail-pre-unlocked-v1' as const;

export type SectionAvailability = 'present' | 'partial' | 'missing';

export type ScorePredictionSection = {
  topScores: Array<{ score: string; probabilityPct: number }>;
  markets: {
    overUnder25: { line: number; overPct: number };
    btts: { yesPct: number };
    handicap: { line: number; label: string; homeCoverPct: number };
    cleanSheet: { homePct: number; awayPct: number };
  };
};

export type RecentFormMatchRow = {
  result: 'W' | 'D' | 'L';
  scoreLabel: string;
  opponentName: string;
  venue: 'home' | 'away';
};

export type RecentFormSection = {
  home: { form: string | null; matches: RecentFormMatchRow[] };
  away: { form: string | null; matches: RecentFormMatchRow[] };
};

export type HeadToHeadRow = {
  dateLabel: string;
  competitionLabel: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  resultLabel: string;
  note?: string | null;
};

export type HeadToHeadSection = {
  summary: string | null;
  aggregate: {
    lastMeetingsCount: number | null;
    homeWins: number | null;
    draws: number | null;
    awayWins: number | null;
  };
  rows: HeadToHeadRow[];
};

export type InjuryUiItem = {
  playerName: string;
  isCore: boolean;
  severity: 'high' | 'medium' | 'low';
  statusText: string;
  type: string | null;
  reason: string | null;
  teamSide: 'home' | 'away';
};

export type InjuriesSection = {
  home: InjuryUiItem[];
  away: InjuryUiItem[];
};

export type OddsTrendRow = {
  marketType: '1x2' | 'handicap' | 'overUnder';
  label: string;
  home: number | null;
  draw: number | null;
  away: number | null;
  trend: 'up' | 'down' | 'stable';
};

export type OddsTrendsSection = {
  rows: OddsTrendRow[];
  disclaimer: string;
};

export type AnalysisPreMatchTab = {
  summary: string;
  tags: string[];
  metrics: {
    expectedGoals: { home: number; away: number };
    formIndex: number;
    counterAttackRisk: number;
    setPieceThreat: 'low' | 'medium' | 'high';
  };
};

export type AnalysisTacticsTab = {
  narrative: string;
  home: { formation: string | null; styleTags: string[] };
  away: { formation: string | null; styleTags: string[] };
};

export type AnalysisKeyPlayerRow = {
  playerId: string;
  nameCn: string;
  teamNameCn: string | null;
  roleLabel: string;
  influence: number;
  goals: number | null;
  assists: number | null;
  rating: number | null;
};

export type AnalysisOddsTab = {
  european: { home: number | null; draw: number | null; away: number | null };
  handicap: { home: number | null; draw: number | null; away: number | null };
  overUnder: { over: number | null; line: number | null; under: number | null };
};

export type AnalysisTabsSection = {
  preMatch: AnalysisPreMatchTab;
  tactics: AnalysisTacticsTab;
  keyPlayers: AnalysisKeyPlayerRow[];
  odds: AnalysisOddsTab;
};

export type HalfFullTimeItem = {
  ht: string;
  ft: string;
  label: string;
  probabilityPct: number;
};

export type PlayerGoalItem = {
  rank: number;
  playerId: string;
  playerName: string;
  teamNameCn: string | null;
  odd: number | null;
  probabilityPct: number;
};

export type ExtendedMarketsSection = {
  halfFullTime: HalfFullTimeItem[];
  playerGoals: PlayerGoalItem[];
  dataQuality: string;
};

export type DeepIntelSection = {
  firstGoalMethod: Array<{ label: string; probabilityPct: number }>;
  firstGoalTime: Array<{ interval: string; probabilityPct: number }>;
  corners: { over95Pct: number | null; over85Pct: number | null; homeAdvantagePct: number | null };
  cards: {
    yellowOver35Pct: number | null;
    yellowOver15Pct: number | null;
    redHomePct: number | null;
    redAwayPct: number | null;
  };
  exactGoals: Array<{ goals: number; probabilityPct: number }>;
  referee: {
    nameCn: string | null;
    matchesCount: number | null;
    styleLabel: string | null;
    yellowCardsAvg: number | null;
    redCardsAvg: number | null;
    penaltiesAvg: number | null;
  } | null;
  sentiment: {
    homeSupportPct: number;
    awaySupportPct: number;
    tags: string[];
  };
};

export type TacticalComparisonRow = {
  dimension: string;
  homeScore: number;
  awayScore: number;
  homeTag: string;
  awayTag: string;
};

export type MomentumSegment = {
  fromMinute: number;
  toMinute: number;
  home: number;
  away: number;
};

export type ActivityHeatmapRow = {
  label: string;
  homePct: number;
  awayPct: number;
};

export type MatchDetailPreUnlockedUi = {
  schema: typeof MATCH_DETAIL_PRE_UNLOCKED_SCHEMA_V1;
  dataAvailability: Record<string, SectionAvailability>;
  sections: {
    scorePrediction: ScorePredictionSection;
    recentForm: RecentFormSection;
    headToHead: HeadToHeadSection;
    injuries: InjuriesSection;
    oddsTrends: OddsTrendsSection;
    analysisTabs: AnalysisTabsSection;
    extendedMarkets: ExtendedMarketsSection;
    deepIntel: DeepIntelSection;
    tacticalComparison: { rows: TacticalComparisonRow[] };
    momentum: { segments: MomentumSegment[] };
    activityHeatmap: { rows: ActivityHeatmapRow[] };
  };
};

export type PreMatchUiBuildContext = {
  preview: MatchIntelPredictionPreview | null;
  predictionMarkets: Record<string, unknown> | null;
  oddsDisclaimer: string;
  supplementaryFacts: unknown;
  injuriesJson: unknown;
  oddsSnapshots: Array<{
    phase: string;
    capturedAt: string;
    markets: unknown;
  }>;
};
