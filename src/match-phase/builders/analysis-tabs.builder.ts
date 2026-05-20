import {
  extractAsianHandicapDecimals,
  extractOdds1x2Decimals,
} from '../../api-football/af-pre-match-mapper.util';
import type { MatchIntelRow } from '../../matches/match-intel.mapper';
import type { MatchIntelPredictionPreview } from '../../matches/match-intel.types';
import { pickPreMatchReport } from '../match-report-picker.util';
import type {
  AnalysisTabsSection,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';
import type { PlayerSeasonMetricRow } from './extended-markets.builder';

function setPieceThreat(tempo: number): 'low' | 'medium' | 'high' {
  if (tempo >= 75) return 'high';
  if (tempo >= 55) return 'medium';
  return 'low';
}

function expertTags(report: { expertVariables: unknown } | null): string[] {
  if (!report?.expertVariables) return [];
  const ev = report.expertVariables;
  if (Array.isArray(ev)) {
    return ev.map((x) => String(x)).filter(Boolean).slice(0, 8);
  }
  if (typeof ev === 'object' && ev !== null) {
    const tags = (ev as { tags?: unknown }).tags;
    if (Array.isArray(tags)) return tags.map((x) => String(x)).slice(0, 8);
  }
  return [];
}

function firstAhMarket(
  predictionMarkets: Record<string, unknown> | null,
): {
  line: number;
  label: string;
  homeCoverPct: number;
} | null {
  if (!predictionMarkets?.markets) return null;
  const markets = predictionMarkets.markets as Record<string, unknown>;
  for (const [key, val] of Object.entries(markets)) {
    if (!key.startsWith('AH_')) continue;
    const block = val as {
      line?: number;
      handicapLabel?: string;
      modelHomeCoverProb?: number;
    };
    if (block.line == null) continue;
    return {
      line: block.line,
      label: block.handicapLabel ?? `让球 ${block.line}`,
      homeCoverPct: block.modelHomeCoverProb ?? 50,
    };
  }
  return null;
}

export function buildAnalysisTabsSection(args: {
  match: MatchIntelRow;
  preview: MatchIntelPredictionPreview | null;
  predictionMarkets: Record<string, unknown> | null;
  oddsSnapshots: Array<{ phase: string; markets: unknown }>;
  isAdmin: boolean;
  preMatchIntelLongSummary?: string | null;
  playerSeasonMetrics?: PlayerSeasonMetricRow[];
}): { section: AnalysisTabsSection; availability: SectionAvailability } {
  const { match, preview, isAdmin, preMatchIntelLongSummary, playerSeasonMetrics = [] } =
    args;
  const preReport = pickPreMatchReport(match.aiReports, isAdmin);
  const homeSnap = match.teamSnapshots.find((s) => s.isHome);
  const awaySnap = match.teamSnapshots.find((s) => !s.isHome);
  const topTactic = match.tacticalScenarios[0];
  const secondTactic = match.tacticalScenarios[1];

  let summary =
    preReport?.dashboardSummary?.trim() ||
    preReport?.freeSummary?.trim().slice(0, 400) ||
    '';
  if (!summary && preMatchIntelLongSummary?.trim()) {
    summary = preMatchIntelLongSummary.trim().slice(0, 500);
  }
  if (!summary && preview) {
    summary = `模型估算主队期望进球 ${preview.homeExpectedGoals.toFixed(2)}，客队 ${preview.awayExpectedGoals.toFixed(2)}；${preview.totalGoalsTrend ?? ''}`;
  }
  if (!summary) summary = '暂无赛前深度分析';

  const tags = expertTags(preReport ?? null);

  const preMatchTab = {
    summary,
    tags,
    metrics: {
      expectedGoals: {
        home: preview?.homeExpectedGoals ?? 0,
        away: preview?.awayExpectedGoals ?? 0,
      },
      formIndex: preview?.confidence ?? 50,
      counterAttackRisk: preview?.upsetIndex ?? 40,
      setPieceThreat: setPieceThreat(preview?.tempoIndex ?? 50),
    },
  };

  const awayStyleTags = secondTactic ?
    [secondTactic.scenarioType, secondTactic.title].filter(Boolean)
  : topTactic ?
    [`应对${topTactic.scenarioType}`, topTactic.title].filter(Boolean).slice(0, 2)
  : [];

  const tacticsTab = {
    narrative:
      topTactic?.process?.slice(0, 500) ||
      topTactic?.precondition?.slice(0, 300) ||
      `${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn} 战术推演待生成。`,
    home: {
      formation: (homeSnap as { formation?: string | null } | undefined)?.formation ?? null,
      styleTags: topTactic ?
        [topTactic.scenarioType, topTactic.title].filter(Boolean)
      : [],
    },
    away: {
      formation: (awaySnap as { formation?: string | null } | undefined)?.formation ?? null,
      styleTags: awayStyleTags,
    },
  };

  const metricByPlayer = new Map(
    playerSeasonMetrics.map((m) => [m.playerId, m]),
  );

  const keyPlayers = [...match.playerIntelligence]
    .sort((a, b) => b.startProbability - a.startProbability)
    .slice(0, 6)
    .map((pi) => {
      type PS = {
        playerId: string;
        last5Goals: number | null;
        last5Assists: number | null;
        formScore: number | null;
      };
      const snaps = match.playerSnapshots as PS[];
      const snap = snaps.find((s) => s.playerId === pi.playerId);
      const season = metricByPlayer.get(pi.playerId);
      const pr = (pi.player as { powerRating?: number }).powerRating;
      return {
        playerId: pi.playerId,
        nameCn: pi.player.nameCn,
        teamNameCn: pi.team?.nameCn ?? null,
        roleLabel: pi.statusTag || pi.aiSummary?.slice(0, 12) || '关键球员',
        influence:
          typeof pr === 'number' && pr > 0 ? pr : pi.startProbability,
        goals: season?.goals ?? snap?.last5Goals ?? null,
        assists: season?.assists ?? snap?.last5Assists ?? null,
        rating: season?.rating ?? snap?.formScore ?? null,
      };
    });

  const snap =
    args.oddsSnapshots.find((s) => s.phase === 'T1') ?? args.oddsSnapshots[0];
  const teaser = snap ? extractOdds1x2Decimals(snap.markets) : null;
  const ahTeaser = snap ? extractAsianHandicapDecimals(snap.markets) : null;
  const ou = args.predictionMarkets?.markets as Record<string, unknown> | undefined;
  const ouBlock = ou?.OU_2_5 as { modelOverProb?: number; line?: number } | undefined;
  const ahModel = firstAhMarket(args.predictionMarkets);

  const oddsTab = {
    european: {
      home: teaser?.home ?? null,
      draw: teaser?.draw ?? null,
      away: teaser?.away ?? null,
    },
    handicap: {
      home: ahTeaser?.home ?? null,
      draw: ahTeaser?.line ?? ahModel?.line ?? null,
      away: ahTeaser?.away ?? null,
    },
    overUnder: {
      over: ouBlock?.modelOverProb ?? null,
      line: ouBlock?.line ?? 2.5,
      under:
        ouBlock?.modelOverProb != null ?
          Math.round(100 - ouBlock.modelOverProb)
        : null,
    },
  };

  const section: AnalysisTabsSection = {
    preMatch: preMatchTab,
    tactics: tacticsTab,
    keyPlayers,
    odds: oddsTab,
  };

  let availability: SectionAvailability = 'partial';
  if (preview && (match.tacticalScenarios.length > 0 || keyPlayers.length > 0)) {
    availability = 'present';
  } else if (!preview) {
    availability = 'missing';
  }

  return { section, availability };
}
