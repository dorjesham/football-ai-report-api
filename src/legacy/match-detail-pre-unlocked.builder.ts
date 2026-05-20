import type { MatchIntelRow } from '../matches/match-intel.mapper';
import type { MatchIntelPredictionPreview } from '../matches/match-intel.types';
import { ODDS_DISCLAIMER } from '../api-football/af-pre-match-mapper.util';
import { pickPreMatchReport } from '../match-phase/match-report-picker.util';
import { extractPreMatchIntelLong } from '../ai-report/long-form-extract.util';
import { buildAnalysisTabsSection } from '../match-phase/builders/analysis-tabs.builder';
import { buildDeepIntelSection } from '../match-phase/builders/deep-intel.builder';
import {
  buildExtendedMarketsSection,
  type PlayerSeasonMetricRow,
} from '../match-phase/builders/extended-markets.builder';
import { buildHeadToHeadSection } from '../match-phase/builders/head-to-head-section.builder';
import { buildInjuriesSection } from '../match-phase/builders/injuries-section.builder';
import { buildOddsTrendsSection } from '../match-phase/builders/odds-trends.builder';
import { buildRecentFormSection } from '../match-phase/builders/recent-form-section.builder';
import { buildScorePredictionSection } from '../match-phase/builders/score-prediction-section.builder';
import {
  buildActivityHeatmapSection,
  buildMomentumSection,
  buildTacticalComparisonSection,
} from '../match-phase/builders/tactical-visuals.builder';
import type { MatchPhaseInjuryItem } from '../match-phase/match-phase.types';
import {
  MATCH_DETAIL_PRE_UNLOCKED_SCHEMA_V1,
  type MatchDetailPreUnlockedUi,
} from '../match-phase/match-detail-pre-unlocked.types';

export function buildMatchDetailPreUnlockedUi(args: {
  match: MatchIntelRow;
  preview: MatchIntelPredictionPreview | null;
  predictionMarkets: Record<string, unknown> | null;
  supplementaryFacts: unknown;
  homeInjuries: MatchPhaseInjuryItem[];
  awayInjuries: MatchPhaseInjuryItem[];
  oddsSnapshots: Array<{ phase: string; capturedAt: string; markets: unknown }>;
  isAdmin: boolean;
  playerSeasonMetrics?: PlayerSeasonMetricRow[];
}): MatchDetailPreUnlockedUi {
  const preReport = pickPreMatchReport(args.match.aiReports, args.isAdmin);
  const longBlock =
    preReport ?
      extractPreMatchIntelLong(preReport.structuredContentJson, true)
    : null;
  const preMatchIntelLongSummary =
    longBlock?.markdown?.slice(0, 500) ??
    (longBlock?.sections ?
      Object.values(longBlock.sections)[0]?.slice(0, 500)
    : null) ??
    null;

  const t1Snap =
    args.oddsSnapshots.find((s) => s.phase === 'T1') ?? args.oddsSnapshots[0];

  const score = buildScorePredictionSection({
    preview: args.preview,
    predictionMarkets: args.predictionMarkets,
  });
  const recentForm = buildRecentFormSection(args.match, args.supplementaryFacts);
  const h2h = buildHeadToHeadSection(args.match.headToHead);
  const injuries = buildInjuriesSection(
    args.match,
    args.homeInjuries,
    args.awayInjuries,
    args.playerSeasonMetrics,
  );
  const oddsTrends = buildOddsTrendsSection({
    snapshots: args.oddsSnapshots,
    disclaimer: ODDS_DISCLAIMER,
  });
  const analysisTabs = buildAnalysisTabsSection({
    match: args.match,
    preview: args.preview,
    predictionMarkets: args.predictionMarkets,
    oddsSnapshots: args.oddsSnapshots,
    isAdmin: args.isAdmin,
    preMatchIntelLongSummary,
    playerSeasonMetrics: args.playerSeasonMetrics,
  });
  const extendedMarkets = buildExtendedMarketsSection({
    match: args.match,
    preview: args.preview,
    oddsMarketsJson: t1Snap?.markets,
    playerSeasonMetrics: args.playerSeasonMetrics,
  });
  const deepIntel = buildDeepIntelSection({
    match: args.match,
    preview: args.preview,
  });
  const tacticalComparison = buildTacticalComparisonSection(args.match);
  const momentum = buildMomentumSection(args.preview);
  const activityHeatmap = buildActivityHeatmapSection(args.match);

  return {
    schema: MATCH_DETAIL_PRE_UNLOCKED_SCHEMA_V1,
    dataAvailability: {
      scorePrediction: score.availability,
      recentForm: recentForm.availability,
      headToHead: h2h.availability,
      injuries: injuries.availability,
      oddsTrends: oddsTrends.availability,
      analysisTabs: analysisTabs.availability,
      extendedMarkets: extendedMarkets.availability,
      deepIntel: deepIntel.availability,
      tacticalComparison: tacticalComparison.availability,
      momentum: momentum.availability,
      activityHeatmap: activityHeatmap.availability,
    },
    sections: {
      scorePrediction: score.section,
      recentForm: recentForm.section,
      headToHead: h2h.section,
      injuries: injuries.section,
      oddsTrends: oddsTrends.section,
      analysisTabs: analysisTabs.section,
      extendedMarkets: extendedMarkets.section,
      deepIntel: deepIntel.section,
      tacticalComparison: { rows: tacticalComparison.rows },
      momentum: { segments: momentum.segments },
      activityHeatmap: { rows: activityHeatmap.rows },
    },
  };
}
