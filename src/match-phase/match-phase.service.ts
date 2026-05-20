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
import { MatchInjuriesService } from '../matches/match-injuries.service';
import { RequestUser } from '../common/types/request-user.type';
import {
  extractPostMatchTacticalLong,
  extractPreMatchIntelLong,
} from '../ai-report/long-form-extract.util';
import { PostMatchStructuredV1Schema } from '../ai-report/schemas/structured-report.schema';
import { MatchLiveService } from '../match-live/match-live.service';
import { parseMatchEventsStorage } from '../match-live/match-events-storage.util';
import {
  MATCH_INTEL_INCLUDE,
  mapMatchShellForPhase,
  type MatchIntelL10n,
  mapPredictionDetailForPhase,
  mapPredictionPreviewForPhase,
  mapTeamSnapshot,
  MatchIntelRow,
} from '../matches/match-intel.mapper';
import { computeLiveStatusSyncHint } from '../matches/match-status-clock.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UnlockService } from '../unlock/unlock.service';
import { DisplayNameService } from '../localization/display-name.service';
import { FootballDictionaryService } from '../localization/football-dictionary.service';
import { LocalizationSeedLoader } from '../localization/localization-seed.loader';
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
    private readonly matchInjuries: MatchInjuriesService,
    private readonly displayName: DisplayNameService,
    private readonly footballDict: FootballDictionaryService,
    private readonly seedLoader: LocalizationSeedLoader,
  ) {}

  private intelL10n(): MatchIntelL10n {
    return {
      displayName: this.displayName,
      dict: this.footballDict,
      seeds: this.seedLoader,
    };
  }

  private links(matchId: string): MatchPhaseResponseV1['meta']['links'] {
    return {
      intel: `/matches/${matchId}/intel`,
      oddsSnapshots: `/matches/${matchId}/odds-snapshots`,
      liveStream: `/matches/${matchId}/live/stream`,
    };
  }

  private async loadMatchRow(
    matchId: string,
  ): Promise<MatchIntelRow & { matchFacts: { supplementaryFacts: unknown; injuriesJson: unknown } | null }> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        ...MATCH_INTEL_INCLUDE,
        matchFacts: {
          select: { supplementaryFacts: true, injuriesJson: true },
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match as MatchIntelRow & {
      matchFacts: { supplementaryFacts: unknown; injuriesJson: unknown } | null;
    };
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
    phase: 'pre' | 'post',
  ): MatchPhaseNarrative | null {
    if (!report) return null;

    const preMatchIntelLong =
      phase === 'pre'
        ? extractPreMatchIntelLong(report.structuredContentJson, isUnlocked)
        : null;
    const tacticalLongForm =
      phase === 'post'
        ? extractPostMatchTacticalLong(report.structuredContentJson, isUnlocked)
        : null;

    if (!isUnlocked) {
      return {
        reportType: report.reportType,
        reportId: report.id,
        status: report.status,
        freeSummary: report.freeSummary.slice(0, 280),
        dashboardSummary: report.dashboardSummary?.slice(0, 120) ?? null,
        disclaimer: report.disclaimer,
        preMatchIntelLong: preMatchIntelLong ?? undefined,
        tacticalLongForm: tacticalLongForm ?? undefined,
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
      preMatchIntelLong: preMatchIntelLong ?? undefined,
      tacticalLongForm: tacticalLongForm ?? undefined,
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

    let homeInjuries: import('./match-phase.types').MatchPhaseInjuryItem[] = [];
    let awayInjuries: import('./match-phase.types').MatchPhaseInjuryItem[] = [];
    let injuriesAvail: 'present' | 'partial' | 'missing' = 'missing';
    try {
      const inj = await this.matchInjuries.forMatch(matchId);
      homeInjuries = inj.homeInjuries;
      awayInjuries = inj.awayInjuries;
      injuriesAvail =
        inj.items.length > 0 ? 'present' : 'missing';
    } catch {
      injuriesAvail = 'missing';
    }

    const h2h = match.headToHead;

    // v2: 下线 match-detail-pre-unlocked 合成 UI（momentum/heatmap/自建 markets）
    const ui = undefined;

    return {
      schema: MATCH_PHASE_SCHEMA_V1,
      deprecated: true,
      deprecatedMessage:
        '请迁移至 GET /matches/:id/detail-v2；本接口将于 90 天后下线',
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
      match: mapMatchShellForPhase(match, this.intelL10n()),
      facts: {
        teamSnapshots: {
          home: mapTeamSnapshot(homeSnap),
          away: mapTeamSnapshot(awaySnap),
        },
        playerSnapshotCount: match.playerSnapshots.length,
        homeForm: homeSnap?.recentForm ?? null,
        awayForm: awaySnap?.recentForm ?? null,
        h2h:
          h2h ?
            {
              lastMeetingsCount: h2h.lastMeetingsCount,
              homeWins: h2h.homeWins,
              draws: h2h.draws,
              awayWins: h2h.awayWins,
              summary: h2h.summary,
            }
          : null,
        homeInjuries,
        awayInjuries,
        dataAvailability: {
          teamSnapshots: hasTeamSnap ? 'present' : 'missing',
          prediction: pred ? 'present' : 'missing',
          preMatchReport: preReport ? 'present' : 'missing',
          injuries: injuriesAvail,
        },
      },
      model: {
        predictionPreview: preview,
        predictionDetail: detail,
        predictionMarkets: null,
        oddsDisclaimer: ODDS_DISCLAIMER,
        oddsSnapshots: preOdds.map((s) => ({
          phase: s.phase,
          capturedAt: s.capturedAt,
          markets: s.markets,
        })),
      },
      narrative: this.narrativeFromReport(preReport, isUnlocked, 'pre'),
      ui,
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
      match: mapMatchShellForPhase(match, this.intelL10n()),
      facts: { live: livePayload },
      model: {
        predictionPreview: mapPredictionPreviewForPhase(match),
        predictionDetail: isUnlocked
          ? mapPredictionDetailForPhase(match)
          : null,
        predictionMarkets: null,
        oddsDisclaimer: livePayload.oddsDisclaimer,
      },
      narrative: this.narrativeFromReport(liveNarrative, isUnlocked, 'pre'),
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
      deprecated: true,
      deprecatedMessage:
        '请迁移至 GET /matches/:id/detail-v2；本接口将于 90 天后下线',
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
      match: mapMatchShellForPhase(row, this.intelL10n()),
      facts: {
        htHome: facts?.htHome ?? null,
        htAway: facts?.htAway ?? null,
        ftHome: facts?.ftHome ?? match.homeScore,
        ftAway: facts?.ftAway ?? match.awayScore,
        eventsCount: events.length,
        events,
        keyMetrics: liveSnap.keyMetrics,
        dataAvailability: {
          ...liveSnap.meta.dataAvailability,
          narrative: postReport ? 'present' : 'missing',
        },
      },
      model: {
        predictionPreview: mapPredictionPreviewForPhase(row),
        predictionDetail:
          isUnlocked && locked ? mapPredictionDetailForPhase(row) : null,
        predictionMarkets: null,
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
      narrative: this.narrativeFromReport(postReport, isUnlocked, 'post'),
    };
  }
}
