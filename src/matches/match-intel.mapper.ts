import { AiReport, HeadToHeadInsight, Match, SocialGuide } from '@prisma/client';
import {
  parseFantasyLineupLaboratory,
  parseRefereeLeagueBenchmark,
  parseRefereeTeamRefSample,
  parseVenueHistoricalContext,
} from './schemas/phase-b-intel.zod';
import { tacticsFromAiReportJson } from './intel-display.util';
import { computeLiveStatusSyncHint } from './match-status-clock.util';
import {
  MATCH_INTEL_SCHEMA_VERSION,
  MatchIntelDashboard,
  MatchIntelFreeLayer,
  MatchIntelHeadToHead,
  MatchIntelHeader,
  MatchIntelMeta,
  MatchIntelPaidBundle,
  MatchIntelPlayerRow,
  MatchIntelPredictionDetail,
  MatchIntelPredictionPreview,
  MatchIntelRefereeBlock,
  MatchIntelPhaseReportTeaser,
  MatchIntelReportSlice,
  MatchIntelResponse,
  MatchIntelScore,
  MatchIntelSocial,
  MatchIntelTactic,
  MatchIntelTeamBlock,
  MatchIntelTeamSnapshot,
  MatchIntelUnlockPrice,
  MatchIntelVenue,
  MatchIntelFantasy,
  MatchIntelWeather,
} from './match-intel.types';

/** Prisma `findUnique` include 与 `MatchesService` 对齐，并附带 player / intelligence 的 team */
export const MATCH_INTEL_INCLUDE = {
  tournament: true,
  competition: true,
  season: true,
  homeTeam: true,
  awayTeam: true,
  teamSnapshots: { include: { team: true } },
  playerSnapshots: { include: { player: true, team: true } },
  refereeSnapshot: { include: { referee: true } },
  weatherSnapshot: true,
  activePrediction: true,
  playerIntelligence: { include: { player: true, team: true } },
  tacticalScenarios: true,
  fantasyAdvice: true,
  headToHead: true,
  socialGuide: true,
  aiReports: { orderBy: { createdAt: 'desc' as const } },
} as const;

export type MatchIntelRow = Match & {
  tournament: { nameCn: string } | null;
  competition: { nameCn: string; code: string | null } | null;
  season: { code: string } | null;
  homeTeam: {
    id: string;
    nameCn: string;
    nameEn: string | null;
    logoUrl: string | null;
    powerRating: number | null;
  };
  awayTeam: {
    id: string;
    nameCn: string;
    nameEn: string | null;
    logoUrl: string | null;
    powerRating: number | null;
  };
  teamSnapshots: Array<{
    isHome: boolean;
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
  }>;
  playerSnapshots: unknown[];
  refereeSnapshot: {
    matchesCount: number | null;
    yellowCardsAvg: number | null;
    redCardsAvg: number | null;
    penaltiesAvg: number | null;
    foulsAvg: number | null;
    homeWinRate: number | null;
    addedTimeAvg: number | null;
    notes: string | null;
    leagueBenchmarks: unknown;
    homeTeamRefHistory: unknown;
    awayTeamRefHistory: unknown;
    dataQuality: string;
    dataSource: string;
    referee: {
      id: string;
      nameCn: string;
      nameEn: string | null;
      avatarUrl: string | null;
      country: string | null;
    };
  } | null;
  weatherSnapshot: {
    temperature: number | null;
    condition: string | null;
    humidity: number | null;
    windSpeed: number | null;
    visibility: number | null;
    pitchCondition: string | null;
    weatherImpactScore: number;
    venueHistoricalContext: unknown;
    dataQuality: string;
    dataSource: string;
  } | null;
  activePrediction: {
    homeWinProbability: number;
    drawProbability: number;
    awayWinProbability: number;
    homeExpectedGoals: number;
    awayExpectedGoals: number;
    totalExpectedGoals: number;
    totalGoalsTrend: string | null;
    tempoIndex: number;
    upsetIndex: number;
    homeMatchPower: number | null;
    awayMatchPower: number | null;
    confidence: number;
    dataQuality: string;
    modelVersion: string;
    factorBreakdown: unknown;
    explanation: string | null;
    dataSource: string;
    version: number;
    lockedAt: Date | null;
    predictionMarkets: unknown;
  } | null;
  playerIntelligence: Array<{
    playerId: string;
    teamId: string;
    statusTag: string;
    startProbability: number;
    riskLevel: string;
    fitnessAnalysis: string | null;
    psychologyAnalysis: string | null;
    matchupAnalysis: string | null;
    weatherImpact: string | null;
    fantasySuggestion: string | null;
    aiSummary: string | null;
    player: {
      nameCn: string;
      nameEn: string | null;
      avatarUrl: string | null;
      powerRating: number | null;
    };
    team: { nameCn: string } | null;
  }>;
  tacticalScenarios: Array<{
    id: string;
    scenarioType: string;
    title: string;
    probability: number;
    precondition: string;
    process: string;
    possibleScore: string | null;
    timeline: string | null;
  }>;
  fantasyAdvice: {
    captainRecommendation: string | null;
    mustHave: unknown;
    valuePicks: unknown;
    avoid: unknown;
    predictedPoints: unknown;
    riskWarnings: unknown;
    lineupLaboratory: unknown;
    dataQuality: string;
    dataSource: string;
  } | null;
  headToHead: HeadToHeadInsight | null;
  socialGuide: SocialGuide | null;
  aiReports: AiReport[];
};

function toPreview(
  pred: NonNullable<MatchIntelRow['activePrediction']>,
): MatchIntelPredictionPreview {
  return {
    homeWinProbability: pred.homeWinProbability,
    drawProbability: pred.drawProbability,
    awayWinProbability: pred.awayWinProbability,
    homeExpectedGoals: pred.homeExpectedGoals,
    awayExpectedGoals: pred.awayExpectedGoals,
    totalExpectedGoals: pred.totalExpectedGoals,
    totalGoalsTrend: pred.totalGoalsTrend,
    tempoIndex: pred.tempoIndex,
    upsetIndex: pred.upsetIndex,
    homeMatchPower: pred.homeMatchPower ?? null,
    awayMatchPower: pred.awayMatchPower ?? null,
    confidence: pred.confidence,
    dataQuality: pred.dataQuality,
  };
}

function toDetail(
  pred: NonNullable<MatchIntelRow['activePrediction']>,
): MatchIntelPredictionDetail {
  return {
    ...toPreview(pred),
    modelVersion: pred.modelVersion,
    factorBreakdown: pred.factorBreakdown,
    explanation: pred.explanation,
    dataSource: pred.dataSource,
    version: pred.version,
    lockedAt: pred.lockedAt ? pred.lockedAt.toISOString() : null,
    predictionMarkets: pred.predictionMarkets ?? null,
  };
}

export function mapTeamSnapshot(
  snap: MatchIntelRow['teamSnapshots'][number] | undefined,
): MatchIntelTeamSnapshot | null {
  if (!snap) return null;
  return {
    leagueRank: snap.leagueRank,
    points: snap.points,
    recentForm: snap.recentForm,
    goalsForAvg: snap.goalsForAvg,
    goalsAgainstAvg: snap.goalsAgainstAvg,
    xgAvg: snap.xgAvg,
    xgaAvg: snap.xgaAvg,
    attackRating: snap.attackRating,
    defenseRating: snap.defenseRating,
    dataQuality: snap.dataQuality,
    dataSource: snap.dataSource,
  };
}

/** 从预测因子 JSON 取 OLS 本场基础 TPR（与 PowerRatingService 写入 factorBreakdown.ols 一致） */
function olsBaseTprFromFactorBreakdown(
  factorBreakdown: unknown,
  side: 'home' | 'away',
): number | null {
  if (!factorBreakdown || typeof factorBreakdown !== 'object') return null;
  const ols = (factorBreakdown as Record<string, unknown>).ols;
  if (!ols || typeof ols !== 'object') return null;
  const key = side === 'home' ? 'homeBaseTpr' : 'awayBaseTpr';
  const v = (ols as Record<string, unknown>)[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function teamBlock(
  match: MatchIntelRow,
  side: 'home' | 'away',
): MatchIntelTeamBlock {
  const team = side === 'home' ? match.homeTeam : match.awayTeam;
  const snap = match.teamSnapshots.find((s) => s.isHome === (side === 'home'));
  const pred = match.activePrediction;
  const baseFromOls = pred ? olsBaseTprFromFactorBreakdown(pred.factorBreakdown, side) : null;
  const powerRating =
    baseFromOls != null ? baseFromOls : (team.powerRating ?? null);
  const matchPower =
    side === 'home' ? (pred?.homeMatchPower ?? null) : (pred?.awayMatchPower ?? null);
  return {
    side,
    teamId: team.id,
    nameCn: team.nameCn,
    nameEn: team.nameEn,
    logoUrl: team.logoUrl,
    powerRating,
    matchPower,
    snapshot: mapTeamSnapshot(snap),
  };
}

function roundLabel(match: MatchIntelRow): string | null {
  const parts = [match.round, match.stage, match.groupName].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** 阶段 6 三页合同：比赛壳（头/场地/球队） */
export function mapMatchShellForPhase(match: MatchIntelRow) {
  return {
    status: match.status,
    kickoffTime: match.kickoffTime.toISOString(),
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    header: {
      isFeatured: match.isFeatured,
      competitionNameCn: match.competition?.nameCn ?? null,
      competitionCode: match.competition?.code ?? null,
      roundLabel: roundLabel(match),
      seasonCode: match.season?.code ?? null,
      tournamentNameCn: match.tournament?.nameCn ?? null,
    },
    venue: {
      stadium: match.stadium,
      city: match.city,
      country: match.country,
      kickoffTime: match.kickoffTime.toISOString(),
    },
    teams: {
      home: teamBlock(match, 'home'),
      away: teamBlock(match, 'away'),
    },
  };
}

export function mapPredictionPreviewForPhase(
  match: MatchIntelRow,
): MatchIntelPredictionPreview | null {
  return match.activePrediction ? toPreview(match.activePrediction) : null;
}

export function mapPredictionDetailForPhase(
  match: MatchIntelRow,
): MatchIntelPredictionDetail | null {
  return match.activePrediction ? toDetail(match.activePrediction) : null;
}

function mapWeather(w: NonNullable<MatchIntelRow['weatherSnapshot']>): MatchIntelWeather {
  return {
    temperature: w.temperature,
    condition: w.condition,
    humidity: w.humidity,
    windSpeed: w.windSpeed,
    visibility: w.visibility,
    pitchCondition: w.pitchCondition,
    weatherImpactScore: w.weatherImpactScore,
    dataQuality: w.dataQuality,
    dataSource: w.dataSource,
    venueHistorical: parseVenueHistoricalContext(w.venueHistoricalContext),
  };
}

function mapReferee(
  snap: NonNullable<MatchIntelRow['refereeSnapshot']>,
): MatchIntelRefereeBlock {
  const r = snap.referee;
  return {
    referee: r
      ? {
          id: r.id,
          nameCn: r.nameCn,
          nameEn: r.nameEn,
          avatarUrl: r.avatarUrl ?? null,
          country: r.country,
        }
      : null,
    stats: {
      matchesCount: snap.matchesCount,
      yellowCardsAvg: snap.yellowCardsAvg,
      redCardsAvg: snap.redCardsAvg,
      penaltiesAvg: snap.penaltiesAvg,
      foulsAvg: snap.foulsAvg,
      homeWinRate: snap.homeWinRate,
      addedTimeAvg: snap.addedTimeAvg,
      notes: snap.notes,
      dataQuality: snap.dataQuality,
      dataSource: snap.dataSource,
    },
    leagueBenchmarks: parseRefereeLeagueBenchmark(snap.leagueBenchmarks),
    homeTeamRefHistory: parseRefereeTeamRefSample(snap.homeTeamRefHistory),
    awayTeamRefHistory: parseRefereeTeamRefSample(snap.awayTeamRefHistory),
  };
}

function mapHeadToHead(h: HeadToHeadInsight): MatchIntelHeadToHead {
  return {
    lastMeetingsCount: h.lastMeetingsCount,
    homeWins: h.homeWins,
    draws: h.draws,
    awayWins: h.awayWins,
    avgGoals: h.avgGoals,
    summary: h.summary,
    homeAdvantageText: h.homeAdvantageText,
    cardsText: h.cardsText,
    cornersText: h.cornersText,
    rawStats: h.rawStats,
    dataQuality: h.dataQuality,
    dataSource: h.dataSource,
  };
}

function mapSocial(s: SocialGuide): MatchIntelSocial {
  return {
    oneLiner: s.oneLiner,
    shareCopy: s.shareCopy,
    shortVideoScript: s.shortVideoScript,
    posterTitle: s.posterTitle,
    posterImageUrl: s.posterImageUrl,
    momentsCopy: s.momentsCopy,
    xiaohongshuTitle: s.xiaohongshuTitle,
  };
}

function mapPhaseTeaser(r: AiReport): MatchIntelPhaseReportTeaser {
  return {
    id: r.id,
    reportType: r.reportType as 'POST_MATCH' | 'LIVE_NARRATIVE',
    status: r.status,
    freeSummary: r.freeSummary.slice(0, 600),
    dashboardSummary: r.dashboardSummary?.slice(0, 200) ?? null,
    predictionId: r.predictionId,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
  };
}

function mapReport(r: AiReport): MatchIntelReportSlice {
  return {
    id: r.id,
    status: r.status,
    reportType: r.reportType,
    modelName: r.modelName,
    dashboardSummary: r.dashboardSummary,
    historicalInsight: r.historicalInsight,
    refereeAnalysis: r.refereeAnalysis,
    weatherAnalysis: r.weatherAnalysis,
    expertVariables: r.expertVariables,
    generatedAt: r.generatedAt.toISOString(),
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
  };
}

function mapFantasy(f: NonNullable<MatchIntelRow['fantasyAdvice']>): MatchIntelFantasy {
  return {
    captainRecommendation: f.captainRecommendation,
    mustHave: f.mustHave,
    valuePicks: f.valuePicks,
    avoid: f.avoid,
    predictedPoints: f.predictedPoints,
    riskWarnings: f.riskWarnings,
    lineupLaboratory: parseFantasyLineupLaboratory(f.lineupLaboratory),
    dataQuality: f.dataQuality,
    dataSource: f.dataSource,
  };
}

export function buildMatchIntelResponse(args: {
  match: MatchIntelRow;
  isUnlocked: boolean;
  isAdminViewer: boolean;
  unlockPrice: MatchIntelUnlockPrice;
  freeSummary: string;
  disclaimer: string;
  report: AiReport | null | undefined;
  postMatchReport?: AiReport | null | undefined;
  liveNarrativeReport?: AiReport | null | undefined;
}): MatchIntelResponse {
  const {
    match,
    isUnlocked,
    isAdminViewer,
    unlockPrice,
    freeSummary,
    disclaimer,
    report,
    postMatchReport,
    liveNarrativeReport,
  } = args;
  const pred = match.activePrediction;
  const preview = pred ? toPreview(pred) : null;

  const freeLayer: MatchIntelFreeLayer = {
    freeSummary,
    unlockPrice,
    predictionPreview: preview,
    postMatchTeaser:
      postMatchReport && (isUnlocked || isAdminViewer)
        ? mapPhaseTeaser(postMatchReport)
        : null,
    liveNarrativeTeaser:
      liveNarrativeReport && (isUnlocked || isAdminViewer)
        ? mapPhaseTeaser(liveNarrativeReport)
        : null,
  };

  const dashboard: MatchIntelDashboard = {
    hasModel: !!pred,
    preview,
    detail: isUnlocked && pred ? toDetail(pred) : null,
  };

  const meta: MatchIntelMeta = {
    schemaVersion: MATCH_INTEL_SCHEMA_VERSION,
    matchId: match.id,
    isUnlocked,
    isAdminViewer,
    liveStatusSyncHint: computeLiveStatusSyncHint({
      status: match.status,
      kickoffTime: match.kickoffTime,
    }),
  };

  const header: MatchIntelHeader = {
    isFeatured: match.isFeatured,
    competitionNameCn: match.competition?.nameCn ?? null,
    competitionCode: match.competition?.code ?? null,
    roundLabel: roundLabel(match),
    seasonCode: match.season?.code ?? null,
    tournamentNameCn: match.tournament?.nameCn ?? null,
  };

  const venue: MatchIntelVenue = {
    stadium: match.stadium,
    city: match.city,
    country: match.country,
    kickoffTime: match.kickoffTime.toISOString(),
  };

  const score: MatchIntelScore = {
    home: match.homeScore,
    away: match.awayScore,
  };

  const keyPlayers: MatchIntelPlayerRow[] = [...match.playerIntelligence]
    .sort((a, b) => b.startProbability - a.startProbability)
    .slice(0, 6)
    .map((p) => ({
      playerId: p.playerId,
      teamId: p.teamId,
      nameCn: p.player.nameCn,
      nameEn: p.player.nameEn,
      avatarUrl: p.player.avatarUrl ?? null,
      powerRating: p.player.powerRating ?? null,
      teamNameCn: p.team?.nameCn ?? null,
      statusTag: p.statusTag,
      startProbability: p.startProbability,
      riskLevel: p.riskLevel,
      aiSummary: p.aiSummary,
      fitnessAnalysis: p.fitnessAnalysis,
      psychologyAnalysis: p.psychologyAnalysis,
      matchupAnalysis: p.matchupAnalysis,
      weatherImpact: p.weatherImpact,
      fantasySuggestion: p.fantasySuggestion,
    }));

  const tacticsFromDb: MatchIntelTactic[] = [...match.tacticalScenarios]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)
    .map((t) => ({
      id: t.id,
      scenarioType: t.scenarioType,
      title: t.title,
      probability: t.probability,
      precondition: t.precondition,
      process: t.process,
      possibleScore: t.possibleScore,
      timeline: t.timeline,
    }));
  const tacticsFromReport = tacticsFromAiReportJson(report?.tacticalScenarios ?? null, {
    max: 3,
  });
  const tactics: MatchIntelTactic[] =
    tacticsFromDb.length > 0 ? tacticsFromDb : tacticsFromReport;

  let paid: MatchIntelPaidBundle | null = null;
  if (isUnlocked) {
    paid = {
      dashboard,
      referee: match.refereeSnapshot ? mapReferee(match.refereeSnapshot) : null,
      weather: match.weatherSnapshot ? mapWeather(match.weatherSnapshot) : null,
      keyPlayers,
      tactics,
      fantasy: match.fantasyAdvice ? mapFantasy(match.fantasyAdvice) : null,
      headToHead: match.headToHead ? mapHeadToHead(match.headToHead) : null,
      social: match.socialGuide ? mapSocial(match.socialGuide) : null,
      report: report ? mapReport(report) : null,
    };
  }

  return {
    meta,
    header,
    venue,
    score,
    teams: {
      home: teamBlock(match, 'home'),
      away: teamBlock(match, 'away'),
    },
    freeLayer,
    disclaimer,
    paid,
  };
}
