import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiReportType,
  MatchStatus,
  UserRole,
} from '@prisma/client';
import { ODDS_DISCLAIMER } from '../api-football/af-pre-match-mapper.util';
import { MatchOddsSnapshotService } from '../api-football/match-odds-snapshot.service';
import { RequestUser } from '../common/types/request-user.type';
import { PostMatchStructuredV1Schema } from '../ai-report/schemas/structured-report.schema';
import { MatchLiveService } from '../match-live/match-live.service';
import { parseMatchEventsStorage } from '../match-live/match-events-storage.util';
import {
  MATCH_INTEL_INCLUDE,
  mapMatchShellForPhase,
  mapPredictionDetailForPhase,
  mapPredictionPreviewForPhase,
  mapTeamSnapshot,
  MatchIntelRow,
} from '../matches/match-intel.mapper';
import { computeLiveStatusSyncHint } from '../matches/match-status-clock.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UnlockService } from '../unlock/unlock.service';
import {
  resolveIntelUnlocked,
} from './match-intel-access.util';
import { pickPreMatchReport, pickTypedReport } from './match-report-picker.util';
import {
  MATCH_PHASE_SCHEMA_V1,
  type MatchPhaseNarrative,
  type MatchPhaseResponseV1,
} from './match-phase.types';

@Injectable()
export class MatchPhaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly unlock: UnlockService,
    private readonly live: MatchLiveService,
    private readonly oddsSnapshots: MatchOddsSnapshotService,
  ) {}

  private links(matchId: string): MatchPhaseResponseV1['meta']['links'] {
    return {
      intel: `/matches/${matchId}/intel`,
      oddsSnapshots: `/matches/${matchId}/odds-snapshots`,
      liveStream: `/matches/${matchId}/live/stream`,
    };
  }

  private async loadMatchRow(matchId: string): Promise<MatchIntelRow> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: MATCH_INTEL_INCLUDE,
    });
    if (!match) throw new NotFoundException('Match not found');
    return match as MatchIntelRow;
  }

  private narrativeFromReport(
    report: {
      id: string;
      reportType: string;
      status: string;
      freeSummary: string;
      dashboardSummary: string | null;
      disclaimer: string;
      structuredContentJson: unknown;
    } | null | undefined,
    isUnlocked: boolean,
  ): MatchPhaseNarrative | null {
    if (!report) return null;
    if (!isUnlocked) {
      return {
        reportType: report.reportType,
        reportId: report.id,
        status: report.status,
        freeSummary: report.freeSummary.slice(0, 280),
        dashboardSummary: report.dashboardSummary?.slice(0, 120) ?? null,
        disclaimer: report.disclaimer,
      };
    }
    let structuredSummary = null;
    if (report.structuredContentJson) {
      const parsed = PostMatchStructuredV1Schema.safeParse(
        report.structuredContentJson,
      );
      if (parsed.success) structuredSummary = parsed.data;
    }
    return {
      reportType: report.reportType,
      reportId: report.id,
      status: report.status,
      freeSummary: report.freeSummary,
      dashboardSummary: report.dashboardSummary,
      disclaimer: report.disclaimer,
      structuredSummary,
    };
  }

  async getCachedOrBuildPreMatch(
    matchId: string,
    viewer: RequestUser | null,
  ): Promise<MatchPhaseResponseV1> {
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const cacheKey =
      !isAdmin && viewer?.id
        ? `matches:phase:pre:user:${viewer.id}:${matchId}`
        : !isAdmin
          ? `matches:phase:pre:anon:${matchId}`
          : null;
    const ttl = this.config.get<number>('cacheMatchPhasePreTtlSec') ?? 30;
    if (cacheKey) {
      const hit = await this.redis.getJson<MatchPhaseResponseV1>(cacheKey);
      if (hit) return hit;
    }
    const payload = await this.buildPreMatch(matchId, viewer);
    if (cacheKey) void this.redis.setJson(cacheKey, payload, ttl);
    return payload;
  }

  async buildPreMatch(
    matchId: string,
    viewer: RequestUser | null,
  ): Promise<MatchPhaseResponseV1> {
    const match = await this.loadMatchRow(matchId);
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const isUnlocked = await resolveIntelUnlocked(this.unlock, match, viewer);
    const preReport = pickPreMatchReport(match.aiReports, isAdmin);

    const homeSnap = match.teamSnapshots.find((s) => s.isHome);
    const awaySnap = match.teamSnapshots.find((s) => !s.isHome);
    const hasTeamSnap = !!(homeSnap || awaySnap);

    const oddsList = await this.oddsSnapshots.listForMatch(matchId);
    const preOdds = oddsList.snapshots.filter(
      (s) => s.phase === 'T24' || s.phase === 'T1',
    );

    const pred = match.activePrediction;
    const preview = mapPredictionPreviewForPhase(match);
    const detail = isUnlocked ? mapPredictionDetailForPhase(match) : null;

    return {
      schema: MATCH_PHASE_SCHEMA_V1,
      phase: 'pre',
      meta: {
        matchId,
        isUnlocked,
        isAdminViewer: isAdmin,
        liveStatusSyncHint: computeLiveStatusSyncHint({
          status: match.status,
          kickoffTime: match.kickoffTime,
        }),
        recommendedPollSec: 30,
        links: this.links(matchId),
      },
      match: mapMatchShellForPhase(match),
      facts: {
        teamSnapshots: {
          home: mapTeamSnapshot(homeSnap),
          away: mapTeamSnapshot(awaySnap),
        },
        playerSnapshotCount: match.playerSnapshots.length,
        dataAvailability: {
          teamSnapshots: hasTeamSnap ? 'present' : 'missing',
          prediction: pred ? 'present' : 'missing',
          preMatchReport: preReport ? 'present' : 'missing',
        },
      },
      model: {
        predictionPreview: preview,
        predictionDetail: detail,
        predictionMarkets:
          isUnlocked ? (pred?.predictionMarkets ?? null) : null,
        oddsDisclaimer: ODDS_DISCLAIMER,
        oddsSnapshots: preOdds.map((s) => ({
          phase: s.phase,
          capturedAt: s.capturedAt,
          markets: s.markets,
        })),
      },
      narrative: this.narrativeFromReport(preReport, isUnlocked),
    };
  }

  async buildLive(
    matchId: string,
    viewer: RequestUser | null,
  ): Promise<MatchPhaseResponseV1> {
    const match = await this.loadMatchRow(matchId);
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const isUnlocked = await resolveIntelUnlocked(this.unlock, match, viewer);
    const livePayload = await this.live.getCachedOrBuild(matchId);
    const liveNarrative = pickTypedReport(
      match.aiReports,
      AiReportType.LIVE_NARRATIVE,
      isAdmin,
    );

    return {
      schema: MATCH_PHASE_SCHEMA_V1,
      phase: 'live',
      meta: {
        matchId,
        isUnlocked,
        isAdminViewer: isAdmin,
        liveStatusSyncHint: computeLiveStatusSyncHint({
          status: match.status,
          kickoffTime: match.kickoffTime,
        }),
        recommendedPollSec: 10,
        links: this.links(matchId),
      },
      match: mapMatchShellForPhase(match),
      facts: { live: livePayload },
      model: {
        predictionPreview: mapPredictionPreviewForPhase(match),
        predictionDetail: isUnlocked
          ? mapPredictionDetailForPhase(match)
          : null,
        predictionMarkets: null,
        oddsDisclaimer: livePayload.oddsDisclaimer,
      },
      narrative: this.narrativeFromReport(liveNarrative, isUnlocked),
    };
  }

  async getCachedOrBuildPostMatch(
    matchId: string,
    viewer: RequestUser | null,
  ): Promise<MatchPhaseResponseV1> {
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const cacheKey =
      !isAdmin && viewer?.id
        ? `matches:phase:post:user:${viewer.id}:${matchId}`
        : !isAdmin
          ? `matches:phase:post:anon:${matchId}`
          : null;
    const ttl = this.config.get<number>('cacheMatchPhasePostTtlSec') ?? 60;
    if (cacheKey) {
      const hit = await this.redis.getJson<MatchPhaseResponseV1>(cacheKey);
      if (hit) return hit;
    }
    const payload = await this.buildPostMatch(matchId, viewer);
    if (cacheKey) void this.redis.setJson(cacheKey, payload, ttl);
    return payload;
  }

  async buildPostMatch(
    matchId: string,
    viewer: RequestUser | null,
  ): Promise<MatchPhaseResponseV1> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        ...MATCH_INTEL_INCLUDE,
        matchFacts: true,
        activePrediction: {
          include: { grading: true },
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== MatchStatus.FINISHED) {
      throw new BadRequestException(
        'Post-match phase requires match status FINISHED',
      );
    }

    const row = match as MatchIntelRow;
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const isUnlocked = await resolveIntelUnlocked(this.unlock, row, viewer);
    const postReport = pickTypedReport(
      row.aiReports,
      AiReportType.POST_MATCH,
      isAdmin,
    );

    const facts = match.matchFacts;
    const events = parseMatchEventsStorage(facts?.events ?? null).items;
    const liveSnap = await this.live.build(matchId, { maxEvents: 50 });

    const pred = match.activePrediction;
    const locked =
      pred?.lockedAt != null ? pred : null;

    return {
      schema: MATCH_PHASE_SCHEMA_V1,
      phase: 'post',
      meta: {
        matchId,
        isUnlocked,
        isAdminViewer: isAdmin,
        liveStatusSyncHint: null,
        recommendedPollSec: 60,
        links: {
          intel: `/matches/${matchId}/intel`,
          oddsSnapshots: `/matches/${matchId}/odds-snapshots`,
        },
      },
      match: mapMatchShellForPhase(row),
      facts: {
        htHome: facts?.htHome ?? null,
        htAway: facts?.htAway ?? null,
        ftHome: facts?.ftHome ?? match.homeScore,
        ftAway: facts?.ftAway ?? match.awayScore,
        eventsCount: events.length,
        keyMetrics: liveSnap.keyMetrics,
        dataAvailability: liveSnap.meta.dataAvailability,
      },
      model: {
        predictionPreview: mapPredictionPreviewForPhase(row),
        predictionDetail:
          isUnlocked && locked ? mapPredictionDetailForPhase(row) : null,
        predictionMarkets:
          isUnlocked && locked ? (locked.predictionMarkets ?? null) : null,
        oddsDisclaimer: ODDS_DISCLAIMER,
        grading:
          locked?.grading
            ? {
                gradedAt: locked.grading.gradedAt.toISOString(),
                actualOutcome: locked.grading.actualOutcome,
                metricsJson: locked.grading.metricsJson,
              }
            : null,
      },
      narrative: this.narrativeFromReport(postReport, isUnlocked),
    };
  }
}
