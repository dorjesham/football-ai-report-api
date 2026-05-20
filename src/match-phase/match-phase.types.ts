import type { MatchDetailPreUnlockedUi } from './match-detail-pre-unlocked.types';
import type { MatchLiveResponse } from '../match-live/match-live.service';
import type {
  MatchIntelHeader,
  MatchIntelLiveStatusSyncHint,
  MatchIntelPredictionDetail,
  MatchIntelPredictionPreview,
  MatchIntelTeamBlock,
  MatchIntelTeamSnapshot,
  MatchIntelVenue,
} from '../matches/match-intel.types';
import type { PostMatchStructuredV1 } from '../ai-report/schemas/structured-report.schema';

export const MATCH_PHASE_SCHEMA_V1 = 'match-phase-v1' as const;

export type MatchPhaseKind = 'pre' | 'live' | 'post';

export type MatchPhaseLinks = {
  intel: string;
  oddsSnapshots: string;
  liveStream?: string;
};

export type MatchPhaseMeta = {
  matchId: string;
  isUnlocked: boolean;
  isAdminViewer: boolean;
  liveStatusSyncHint: MatchIntelLiveStatusSyncHint | null;
  recommendedPollSec: number;
  links: MatchPhaseLinks;
};

export type MatchPhaseMatchShell = {
  status: string;
  kickoffTime: string;
  homeScore: number | null;
  awayScore: number | null;
  header: MatchIntelHeader;
  venue: MatchIntelVenue;
  teams: { home: MatchIntelTeamBlock; away: MatchIntelTeamBlock };
};

export type MatchPhaseInjuryItem = {
  playerName: string;
  type: string | null;
  reason: string | null;
  teamSide: 'home' | 'away';
};

export type MatchPhasePreFacts = {
  teamSnapshots: {
    home: MatchIntelTeamSnapshot | null;
    away: MatchIntelTeamSnapshot | null;
  };
  playerSnapshotCount: number;
  homeForm: string | null;
  awayForm: string | null;
  h2h: {
    lastMeetingsCount: number | null;
    homeWins: number | null;
    draws: number | null;
    awayWins: number | null;
    summary: string | null;
  } | null;
  homeInjuries: MatchPhaseInjuryItem[];
  awayInjuries: MatchPhaseInjuryItem[];
  dataAvailability: {
    teamSnapshots: 'present' | 'partial' | 'missing';
    prediction: 'present' | 'missing';
    preMatchReport: 'present' | 'missing';
    injuries: 'present' | 'partial' | 'missing';
  };
};

export type MatchPhaseLiveFacts = {
  live: MatchLiveResponse;
};

export type MatchPhasePostFacts = {
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  eventsCount: number;
  events: MatchLiveResponse['events'];
  keyMetrics: MatchLiveResponse['keyMetrics'];
  dataAvailability: {
    events: 'present' | 'partial' | 'missing';
    teamStats: 'present' | 'partial' | 'missing';
    narrative: 'present' | 'missing';
  };
};

export type MatchPhaseOddsTeaser = {
  phase: string;
  capturedAt: string;
  markets: unknown;
};

export type MatchPhaseModel = {
  predictionPreview: MatchIntelPredictionPreview | null;
  predictionDetail: MatchIntelPredictionDetail | null;
  predictionMarkets: unknown | null;
  oddsDisclaimer: string;
  oddsSnapshots?: MatchPhaseOddsTeaser[];
  grading?: {
    gradedAt: string;
    actualOutcome: unknown;
    metricsJson: unknown;
  } | null;
};

export type MatchPhaseLongFormBlock = {
  markdown: string;
  sections?: Record<string, string>;
  locked?: boolean;
  teaser?: string;
};

export type MatchPhaseNarrative = {
  reportType: string;
  reportId: string;
  status: string;
  freeSummary: string;
  dashboardSummary: string | null;
  disclaimer: string;
  structuredSummary?: PostMatchStructuredV1 | null;
  preMatchIntelLong?: MatchPhaseLongFormBlock | null;
  tacticalLongForm?: MatchPhaseLongFormBlock | null;
};

export type MatchPhaseResponseV1 = {
  schema: typeof MATCH_PHASE_SCHEMA_V1;
  /** v2：请改用 GET /matches/:id/detail-v2 */
  deprecated?: boolean;
  deprecatedMessage?: string;
  phase: MatchPhaseKind;
  meta: MatchPhaseMeta;
  match: MatchPhaseMatchShell;
  facts: MatchPhasePreFacts | MatchPhaseLiveFacts | MatchPhasePostFacts;
  model: MatchPhaseModel;
  narrative: MatchPhaseNarrative | null;
  /** 仅 `phase=pre` 且已解锁时返回 */
  ui?: MatchDetailPreUnlockedUi;
};
