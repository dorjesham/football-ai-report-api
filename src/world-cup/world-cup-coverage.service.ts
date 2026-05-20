import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSourceType, Prisma, ReportStatus } from '@prisma/client';
import {
  availabilityFromValue,
  type AfAvailabilityStatus,
} from '../match-af-raw-bundle/af-availability.util';
import { extractAfTeamComparison } from '../match-af-raw-bundle/af-predictions-comparison.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  MATCH_BUNDLE_FIELD_BY_ENDPOINT_ID,
  registryMatchScopedForCoverage,
  type AfIngestEndpointDefinition,
} from '../api-football/ingest-endpoint.registry';
import { isWorldCupMatch, WORLD_CUP_COMPETITION_CODE } from './world-cup-match.util';
import { LocalizationService } from '../localization/localization.service';

export type CoverageEndpointStatus =
  | 'success'
  | 'empty'
  | 'missing'
  | 'stale'
  | 'not_applicable';

export type WorldCupMatchCoverage = {
  matchId: string;
  externalId: string | null;
  kickoffAt: string;
  status: 'green' | 'yellow' | 'red';
  score: number;
  endpoints: Array<{
    id: string;
    label: string;
    required: boolean;
    status: CoverageEndpointStatus;
    lastSyncedAt?: string;
    message?: string;
  }>;
  gates: {
    aiPublishable: boolean;
    aiGeneratable: boolean;
    reasons: string[];
  };
};

const LEAGUE_SCOPED_IDS = new Set([
  'fixtures_league',
  'teams',
  'squads',
  'standings',
  'leaderboards',
  'team_statistics',
  'fixtures_rounds',
  'trophies',
  'sidelined',
  'player_profiles',
]);

const T24_MS = 24 * 3600_000;

type MatchCoverageRow = Prisma.MatchGetPayload<{
  include: {
    competition: { select: { code: true } };
    tournament: { select: { code: true } };
    afRawBundle: true;
    teamSnapshots: true;
    weatherSnapshot: true;
    activePrediction: true;
    refereeSnapshot: { include: { referee: true } };
    matchFacts: { select: { matchId: true; injuriesJson: true } };
    homeTeam: { select: { externalId: true } };
    awayTeam: { select: { externalId: true } };
    aiReports: {
      select: { isStale: true; status: true };
    };
  };
}>;

@Injectable()
export class WorldCupCoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly l10n: LocalizationService,
  ) {}

  /** 中文覆盖率摘要（warning 级，不阻断 AI 发布） */
  async getZhCoverageReport(competitionCode = 'WC') {
    const coverage = await this.l10n.getCoverage({ competitionCode });
    const warnings: string[] = [];
    if (coverage.teamPct < 100) {
      warnings.push(`WC_ZH_TEAM_COVERAGE_${coverage.teamPct}`);
    }
    if (coverage.playerPct < 80) {
      warnings.push(`WC_ZH_PLAYER_COVERAGE_LOW_${coverage.playerPct}`);
    }
    return { coverage, warnings, blocking: false };
  }

  async getMatchCoverage(matchId: string): Promise<WorldCupMatchCoverage> {
    const match = await this.loadMatchForCoverage(matchId);
    const endpoints = this.buildEndpoints(match);
    const gates = await this.evaluateGates(match, match.afRawBundle?.predictionsJson);
    const status = this.aggregateStatus(endpoints, gates.reasons);
    const score = this.computeScore(endpoints);

    return {
      matchId: match.id,
      externalId: match.externalId,
      kickoffAt: match.kickoffTime.toISOString(),
      status,
      score,
      endpoints,
      gates,
    };
  }

  async evaluatePublishGate(matchId: string): Promise<{
    aiPublishable: boolean;
    reasons: string[];
  }> {
    const cov = await this.getMatchCoverage(matchId);
    return {
      aiPublishable: cov.gates.aiPublishable,
      reasons: cov.gates.reasons,
    };
  }

  async evaluateGenerateGate(matchId: string): Promise<{
    aiGeneratable: boolean;
    reasons: string[];
  }> {
    const match = await this.loadMatchForCoverage(matchId);
    const gates = this.evaluateGenerateGatesOnly(match, match.afRawBundle?.predictionsJson);
    return { aiGeneratable: gates.aiGeneratable, reasons: gates.reasons };
  }

  /** Aggregate top missing gate reasons across WC matches (for bootstrap summary). */
  summarizeTopMissing(
    reasonLists: string[][],
    limit = 5,
  ): Array<{ reason: string; count: number }> {
    const counts = new Map<string, number>();
    for (const reasons of reasonLists) {
      for (const r of reasons) {
        counts.set(r, (counts.get(r) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([reason, count]) => ({ reason, count }));
  }

  private async loadMatchForCoverage(matchId: string): Promise<MatchCoverageRow> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: { select: { code: true } },
        tournament: { select: { code: true } },
        afRawBundle: true,
        teamSnapshots: true,
        weatherSnapshot: true,
        activePrediction: true,
        refereeSnapshot: { include: { referee: true } },
        matchFacts: { select: { matchId: true, injuriesJson: true } },
        homeTeam: { select: { externalId: true } },
        awayTeam: { select: { externalId: true } },
        aiReports: {
          where: {
            reportType: 'PRE_MATCH',
            status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW, ReportStatus.PUBLISHED] },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { isStale: true, status: true },
        },
      },
    });
    if (!match) {
      throw new Error(`Match not found: ${matchId}`);
    }
    return match;
  }

  private buildEndpoints(match: MatchCoverageRow): WorldCupMatchCoverage['endpoints'] {
    const bundle = match.afRawBundle;
    const syncedAt = bundle?.syncedAt?.toISOString();
    const endpointHashes =
      bundle?.endpointHashes && typeof bundle.endpointHashes === 'object' ?
        (bundle.endpointHashes as Record<string, string>)
      : null;

    const out: WorldCupMatchCoverage['endpoints'] = [];

    for (const def of registryMatchScopedForCoverage()) {
      if (LEAGUE_SCOPED_IDS.has(def.id)) continue;

      const ep = this.endpointForDefinition(match, def, syncedAt, endpointHashes);
      if (ep) out.push(ep);
    }

    return out;
  }

  private endpointForDefinition(
    match: MatchCoverageRow,
    def: AfIngestEndpointDefinition,
    syncedAt: string | undefined,
    endpointHashes: Record<string, string> | null,
  ): WorldCupMatchCoverage['endpoints'][0] | null {
    switch (def.id) {
      case 'predictions_materialized':
        return this.endpointFromPrediction(match.activePrediction, def);
      case 'team_snapshot':
        return this.endpointFromSnapshots(match.teamSnapshots, def);
      case 'weather':
        return this.endpointFromWeather(match, def);
      case 'facts_dual_write':
        return this.endpointFromFactsDualWrite(match, def);
      case 'coachs':
        return this.endpointFromCoachs(match, def, syncedAt);
      case 'odds_live':
        return {
          id: def.id,
          label: def.label,
          required: def.requiredForWorldCup,
          status: 'not_applicable',
          message: 'checked on LIVE reconcile only',
        };
      default: {
        const field = MATCH_BUNDLE_FIELD_BY_ENDPOINT_ID[def.id];
        if (!field) return null;
        const val = bundleField(match, field);
        const afStatus = availabilityFromValue(val);
        let status = this.mapAfStatus(afStatus);
        let message =
          afStatus === 'empty' ? 'AF returned empty' : undefined;
        if (endpointHashes && val != null && endpointHashes[field] == null && status === 'success') {
          status = 'stale';
          message = 'endpoint hash not recorded';
        }
        return {
          id: def.id,
          label: def.label,
          required: def.requiredForWorldCup,
          status,
          lastSyncedAt: syncedAt,
          message,
        };
      }
    }
  }

  private endpointFromFactsDualWrite(
    match: MatchCoverageRow,
    def: AfIngestEndpointDefinition,
  ): WorldCupMatchCoverage['endpoints'][0] {
    if (this.config.get<boolean>('enableAfFactsDualWrite') !== true) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'not_applicable',
        message: 'ENABLE_AF_FACTS_DUAL_WRITE=false',
      };
    }
    if (match.refereeSnapshot?.referee) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'success',
      };
    }
    if (match.matchFacts) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'empty',
        message: 'MatchFacts without RefereeSnapshot',
      };
    }
    return {
      id: def.id,
      label: def.label,
      required: def.requiredForWorldCup,
      status: 'missing',
      message: 'facts dual-write not run',
    };
  }

  private endpointFromCoachs(
    match: MatchCoverageRow,
    def: AfIngestEndpointDefinition,
    syncedAt: string | undefined,
  ): WorldCupMatchCoverage['endpoints'][0] {
    const bundle = match.afRawBundle as {
      homeCoachJson?: unknown;
      awayCoachJson?: unknown;
    } | null;
    const hasHome = availabilityFromValue(bundle?.homeCoachJson) === 'present';
    const hasAway = availabilityFromValue(bundle?.awayCoachJson) === 'present';
    if (hasHome && hasAway) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'success',
        lastSyncedAt: syncedAt,
      };
    }
    if (hasHome || hasAway) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'empty',
        message: 'partial coach data',
        lastSyncedAt: syncedAt,
      };
    }
    return {
      id: def.id,
      label: def.label,
      required: def.requiredForWorldCup,
      status: 'missing',
      lastSyncedAt: syncedAt,
    };
  }

  private async evaluateGates(
    match: MatchCoverageRow,
    predictionsJson: unknown,
  ): Promise<WorldCupMatchCoverage['gates']> {
    const reasons = this.collectPublishGateReasons(match, predictionsJson);
    const zhWarnings: string[] = [];
    if (isWorldCupMatch(match)) {
      const zh = await this.getZhCoverageReport(
        match.competition?.code ?? WORLD_CUP_COMPETITION_CODE,
      );
      zhWarnings.push(...zh.warnings);
    }
    const aiPublishable = reasons.length === 0;
    const gen = this.evaluateGenerateGatesOnly(match, predictionsJson);
    return {
      aiPublishable,
      aiGeneratable: gen.aiGeneratable,
      reasons: [...reasons, ...zhWarnings],
    };
  }

  private evaluateGenerateGatesOnly(
    match: MatchCoverageRow,
    predictionsJson: unknown,
  ): { aiGeneratable: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (!match.afRawBundle?.fixtureJson) reasons.push('missing_fixture');
    if (!match.afRawBundle?.predictionsJson) reasons.push('missing_af_predictions');
    if (!match.activePrediction) {
      reasons.push('missing_match_prediction');
    } else if (match.activePrediction.dataSource !== DataSourceType.API_FOOTBALL) {
      reasons.push('prediction_not_af');
    }

    const homeSnap = match.teamSnapshots.find((s) => s.isHome);
    const awaySnap = match.teamSnapshots.find((s) => !s.isHome);
    if (!homeSnap || !awaySnap) reasons.push('missing_team_snapshots');

    const aiGeneratable = reasons.length === 0;
    void predictionsJson;
    return { aiGeneratable, reasons };
  }

  private collectPublishGateReasons(
    match: MatchCoverageRow,
    predictionsJson: unknown,
  ): string[] {
    const reasons: string[] = [];

    if (!match.afRawBundle?.fixtureJson) reasons.push('missing_fixture');
    if (match.afRawBundle?.predictionsJson == null) {
      reasons.push('missing_af_predictions');
    }
    if (!match.activePrediction) {
      reasons.push('missing_match_prediction');
    } else {
      if (match.activePrediction.dataSource !== DataSourceType.API_FOOTBALL) {
        reasons.push('prediction_not_af');
      }
      const mv = match.activePrediction.modelVersion.toLowerCase();
      if (!mv.includes('af')) reasons.push('prediction_model_not_af');
      const fb = match.activePrediction.factorBreakdown as Record<string, unknown> | null;
      if (fb?.winProbSource === 'ELO_FORM_FALLBACK') reasons.push('prediction_elo_fallback');
    }

    const injStatus = availabilityFromValue(match.afRawBundle?.injuriesJson);
    if (injStatus === 'missing') reasons.push('missing_injuries');
    else if (injStatus === 'empty') reasons.push('injuries_empty');

    const homeSnap = match.teamSnapshots.find((s) => s.isHome);
    const awaySnap = match.teamSnapshots.find((s) => !s.isHome);
    if (!homeSnap || !awaySnap) {
      reasons.push('missing_team_snapshots');
    } else {
      if (homeSnap.attackRating == null || homeSnap.defenseRating == null) {
        reasons.push('home_snapshot_ratings_incomplete');
      }
      if (awaySnap.attackRating == null || awaySnap.defenseRating == null) {
        reasons.push('away_snapshot_ratings_incomplete');
      }
    }

    const comparison = extractAfTeamComparison(predictionsJson);
    if (!comparison.available) reasons.push('missing_af_comparison');

    if (!match.intelContentHash) reasons.push('missing_intel_content_hash');

    if (!match.homeTeam.externalId?.startsWith('af-t-')) reasons.push('home_team_not_af');
    if (!match.awayTeam.externalId?.startsWith('af-t-')) reasons.push('away_team_not_af');

    const weatherReason = this.weatherGateReason(match);
    if (weatherReason) reasons.push(weatherReason);

    const staleReport = match.aiReports[0];
    if (staleReport?.isStale) reasons.push('ai_report_stale');

    return reasons;
  }

  private weatherGateReason(match: MatchCoverageRow): string | null {
    if (!match.city?.trim()) return null;
    const now = Date.now();
    const kickoff = match.kickoffTime.getTime();
    if (kickoff - now > T24_MS || kickoff < now) return null;
    if (!match.weatherSnapshot) return 'missing_weather';
    return null;
  }

  private endpointFromPrediction(
    pred: { dataSource: DataSourceType; modelVersion: string } | null,
    def: AfIngestEndpointDefinition,
  ): WorldCupMatchCoverage['endpoints'][0] {
    if (!pred) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'missing',
        message: 'No MatchPrediction',
      };
    }
    const ok =
      pred.dataSource === DataSourceType.API_FOOTBALL &&
      pred.modelVersion.toLowerCase().includes('af');
    return {
      id: def.id,
      label: def.label,
      required: def.requiredForWorldCup,
      status: ok ? 'success' : 'missing',
      message: ok ? undefined : `dataSource=${pred.dataSource}`,
    };
  }

  private endpointFromSnapshots(
    snaps: Array<{ isHome: boolean; attackRating: number | null; defenseRating: number | null }>,
    def: AfIngestEndpointDefinition,
  ): WorldCupMatchCoverage['endpoints'][0] {
    const home = snaps.find((s) => s.isHome);
    const away = snaps.find((s) => !s.isHome);
    if (!home || !away) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'missing',
      };
    }
    const incomplete =
      home.attackRating == null ||
      home.defenseRating == null ||
      away.attackRating == null ||
      away.defenseRating == null;
    return {
      id: def.id,
      label: def.label,
      required: def.requiredForWorldCup,
      status: incomplete ? 'empty' : 'success',
      message: incomplete ? 'attack/defense ratings not sourced from AF stats' : undefined,
    };
  }

  private endpointFromWeather(
    match: { city: string | null; kickoffTime: Date; weatherSnapshot: unknown },
    def: AfIngestEndpointDefinition,
  ): WorldCupMatchCoverage['endpoints'][0] {
    if (match.weatherSnapshot) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'success',
      };
    }
    if (!match.city?.trim()) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'not_applicable',
        message: 'venueCityMissing',
      };
    }
    const now = Date.now();
    const kickoff = match.kickoffTime.getTime();
    if (kickoff - now > T24_MS) {
      return {
        id: def.id,
        label: def.label,
        required: def.requiredForWorldCup,
        status: 'not_applicable',
        message: 'notInT24Window',
      };
    }
    return {
      id: def.id,
      label: def.label,
      required: def.requiredForWorldCup,
      status: 'missing',
      message: 'QWeather not configured or sync pending',
    };
  }

  private mapAfStatus(s: AfAvailabilityStatus): CoverageEndpointStatus {
    if (s === 'present') return 'success';
    if (s === 'empty') return 'empty';
    if (s === 'stale') return 'stale';
    return 'missing';
  }

  private aggregateStatus(
    endpoints: WorldCupMatchCoverage['endpoints'],
    gateReasons: string[],
  ): 'green' | 'yellow' | 'red' {
    if (
      gateReasons.some((r) =>
        [
          'missing_af_predictions',
          'missing_match_prediction',
          'missing_team_snapshots',
          'missing_fixture',
          'prediction_not_af',
        ].includes(r),
      )
    ) {
      return 'red';
    }
    const requiredMissing = endpoints.some(
      (e) => e.required && (e.status === 'missing' || e.status === 'empty'),
    );
    if (requiredMissing || gateReasons.length > 0) return 'yellow';
    return 'green';
  }

  private computeScore(endpoints: WorldCupMatchCoverage['endpoints']): number {
    let total = 0;
    let got = 0;
    for (const e of endpoints) {
      if (!e.required) continue;
      total += 10;
      if (e.status === 'success') got += 10;
      else if (e.status === 'empty') got += 4;
    }
    return total > 0 ? Math.round((got / total) * 100) : 0;
  }

  async isWorldCupMatchId(matchId: string): Promise<boolean> {
    const m = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: { select: { code: true } },
        tournament: { select: { code: true } },
      },
    });
    return isWorldCupMatch(m);
  }
}

function bundleField(
  match: { afRawBundle: Record<string, unknown> | null },
  field: string,
): unknown {
  if (!match.afRawBundle) return null;
  return (match.afRawBundle as Record<string, unknown>)[field];
}
