import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiReport,
  AiReportType,
  MatchStatus,
  ReportStatus,
  RiskLevel,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MatchCacheInvalidationService } from './match-cache-invalidation.service';
import { stableQueryHash } from '../common/utils/stable-query-hash';
import { RequestUser } from '../common/types/request-user.type';
import { DEFAULT_AI_DISCLAIMER } from '../common/constants/disclaimer.constant';
import { UnlockService } from '../unlock/unlock.service';
import {
  buildMatchIntelResponse,
  MATCH_INTEL_INCLUDE,
  MatchIntelRow,
} from './match-intel.mapper';
import { afBundleToPredictionPreview } from './match-intel-af-bundle.util';
import { resolveIntelFreeSummaryForDisplay } from './intel-display.util';
import { MatchIntelUnlockPrice } from './match-intel.types';
import { computeLiveStatusSyncHint } from './match-status-clock.util';
import { MatchOddsSnapshotService } from '../api-football/match-odds-snapshot.service';
import { MatchInjuriesService } from './match-injuries.service';
import { TacticsService } from '../tactics/tactics.service';
import { DisplayNameService } from '../localization/display-name.service';
import { FootballDictionaryService } from '../localization/football-dictionary.service';
import { LocalizationSeedLoader } from '../localization/localization-seed.loader';
import { MatchPresentationEnricherService } from '../localization/match-presentation-enricher.service';

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly unlock: UnlockService,
    private readonly oddsSnapshots: MatchOddsSnapshotService,
    private readonly redis: RedisService,
    private readonly matchCacheInvalidation: MatchCacheInvalidationService,
    private readonly matchInjuries: MatchInjuriesService,
    private readonly tactics: TacticsService,
    private readonly displayName: DisplayNameService,
    private readonly footballDict: FootballDictionaryService,
    private readonly seedLoader: LocalizationSeedLoader,
    private readonly presentation: MatchPresentationEnricherService,
  ) {}

  private intelL10n() {
    return {
      displayName: this.displayName,
      dict: this.footballDict,
      seeds: this.seedLoader,
    };
  }

  getMatchInjuries(matchId: string) {
    return this.matchInjuries.forMatch(matchId);
  }

  /**
   * 管理员始终全量；已完赛且已登录（任意角色含 USER）免费开放全量情报，不要求解锁订单；
   * 未开赛 / 进行中：已登录且存在已支付解锁时全量。
   */
  private async resolveIntelUnlocked(
    match: { id: string; status: MatchStatus },
    viewer: RequestUser | null,
  ): Promise<boolean> {
    if (viewer?.role === UserRole.ADMIN) return true;
    const userId = viewer?.id;
    if (match.status === MatchStatus.FINISHED && userId) return true;
    if (userId) return this.unlock.canAccessPaidIntel(userId, match.id);
    return false;
  }

  private unlockPriceForMatch(match: { isFeatured: boolean }): MatchIntelUnlockPrice {
    const featured = match.isFeatured === true;
    const cents = featured
      ? this.config.get<number>('featuredReportUnlockPriceCents') ?? 990
      : this.config.get<number>('reportUnlockPriceCents') ?? 690;
    return {
      amountCents: cents,
      currency: 'CNY',
      display: `¥${(cents / 100).toFixed(1)}`,
      tier: featured ? 'featured' : 'standard',
    };
  }

  async findAll(filters: {
    tournamentId?: string;
    competitionId?: string;
    seasonId?: string;
    status?: string;
  }) {
    const cacheKey = `matches:list:v2:${stableQueryHash(filters as Record<string, unknown>)}`;
    const ttl = this.config.get<number>('cacheMatchesListTtlSec') ?? 20;
    const hit = await this.redis.getJson<unknown[]>(cacheKey);
    if (hit) return hit;

    const rows = await this.prisma.match.findMany({
      where: {
        tournamentId: filters.tournamentId,
        competitionId: filters.competitionId,
        seasonId: filters.seasonId,
        status: filters.status
          ? (filters.status as MatchStatus)
          : undefined,
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        tournament: true,
      },
      orderBy: { kickoffTime: 'asc' },
    });
    const enriched = await this.presentation.enrichMatchList(rows);
    const out = enriched.map((m) => ({
      ...m,
      liveStatusSyncHint: computeLiveStatusSyncHint({
        status: m.status,
        kickoffTime: m.kickoffTime,
      }),
    }));
    await this.redis.setJson(cacheKey, out, ttl);
    return out;
  }

  async getMatchIntel(matchId: string, viewer: RequestUser | null) {
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const cacheKey =
      !isAdmin && viewer?.id ?
        `matches:intel:user:${viewer.id}:${matchId}`
      : !isAdmin ? `matches:intel:anon:${matchId}`
      : null;
    const ttl =
      viewer?.id ?
        (this.config.get<number>('cacheMatchIntelUserTtlSec') ?? 5)
      : (this.config.get<number>('cacheMatchIntelAnonTtlSec') ?? 15);

    if (cacheKey) {
      const hit =
        await this.redis.getJson<ReturnType<typeof buildMatchIntelResponse>>(
          cacheKey,
        );
      if (hit !== null) return hit;
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: MATCH_INTEL_INCLUDE,
    });
    if (!match) throw new NotFoundException('Match not found');

    const isUnlocked = await this.resolveIntelUnlocked(match, viewer);

    const report = this.pickPreMatchReportForIntel(match.aiReports, isAdmin);
    const postMatchReport = this.pickTypedReport(
      match.aiReports,
      'POST_MATCH',
      isAdmin,
    );
    const liveNarrativeReport = this.pickTypedReport(
      match.aiReports,
      'LIVE_NARRATIVE',
      isAdmin,
    );

    const unlockPrice = this.unlockPriceForMatch(match);

    const freeSummaryForDisplay = resolveIntelFreeSummaryForDisplay({
      report: report
        ? {
            freeSummary: report.freeSummary,
            dashboardSummary: report.dashboardSummary,
            historicalInsight: report.historicalInsight,
          }
        : undefined,
      prediction: match.activePrediction ?? undefined,
    });

    return this.finalizeMatchIntelResponse(
      cacheKey,
      ttl,
      buildMatchIntelResponse({
        match: match as MatchIntelRow,
        isUnlocked,
        isAdminViewer: isAdmin,
        unlockPrice,
        freeSummary: freeSummaryForDisplay,
        disclaimer: report?.disclaimer || DEFAULT_AI_DISCLAIMER,
        report,
        postMatchReport,
        liveNarrativeReport,
        showOls: false,
        showPredictionMarkets: false,
        afPredictionsFromBundle: await this.loadAfPredictionsForIntel(matchId),
        l10n: this.intelL10n(),
      }),
    );
  }

  /** intel 兼容：已解锁时优先展示 bundle 内 AF 预测整包 */
  private async loadAfPredictionsForIntel(matchId: string): Promise<unknown | null> {
    if (this.config.get<boolean>('enableAfRawBundle') === false) return null;
    const bundle = await this.prisma.matchAfRawBundle.findUnique({
      where: { matchId },
      select: { predictionsJson: true },
    });
    return bundle?.predictionsJson ?? null;
  }

  private finalizeMatchIntelResponse(
    cacheKey: string | null,
    ttl: number,
    payload: ReturnType<typeof buildMatchIntelResponse>,
  ): ReturnType<typeof buildMatchIntelResponse> {
    if (cacheKey) void this.redis.setJson(cacheKey, payload, ttl);
    return payload;
  }

  async getMatchDetail(matchId: string, viewer: RequestUser | null) {
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const cacheKey =
      !isAdmin && viewer?.id ?
        `matches:detail:user:${viewer.id}:${matchId}`
      : !isAdmin ? `matches:detail:anon:${matchId}`
      : null;
    const ttl =
      viewer?.id ?
        (this.config.get<number>('cacheMatchDetailUserTtlSec') ?? 5)
      : (this.config.get<number>('cacheMatchDetailAnonTtlSec') ?? 15);

    if (cacheKey) {
      const hit = await this.redis.getJson(cacheKey);
      if (hit !== null) return hit as never;
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: MATCH_INTEL_INCLUDE,
    });
    if (!match) throw new NotFoundException('Match not found');

    const isUnlocked = await this.resolveIntelUnlocked(match, viewer);

    const report = this.pickPreMatchReportForIntel(match.aiReports, isAdmin);
    const postMatchReport = this.pickTypedReport(
      match.aiReports,
      'POST_MATCH',
      isAdmin,
    );
    const liveNarrativeReport = this.pickTypedReport(
      match.aiReports,
      'LIVE_NARRATIVE',
      isAdmin,
    );

    const homeTeamSnapshot =
      match.teamSnapshots.find((s) => s.isHome) ?? null;
    const awayTeamSnapshot =
      match.teamSnapshots.find((s) => !s.isHome) ?? null;

    const pred = match.activePrediction;
    const predictionPreview = pred
      ? {
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
        }
      : null;

    const freeSummaryForDisplay = resolveIntelFreeSummaryForDisplay({
      report: report
        ? {
            freeSummary: report.freeSummary,
            dashboardSummary: report.dashboardSummary,
            historicalInsight: report.historicalInsight,
          }
        : undefined,
      prediction: match.activePrediction ?? undefined,
    });

    const unlockPricing = this.unlockPriceForMatch(match);
    const base = {
      match: {
        id: match.id,
        kickoffTime: match.kickoffTime,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        isFeatured: match.isFeatured,
        reportStatus: match.reportStatus,
        liveStatusSyncHint: computeLiveStatusSyncHint({
          status: match.status,
          kickoffTime: match.kickoffTime,
        }),
      },
      tournament: match.tournament,
      competition: match.competition
        ? this.presentation.enrichCompetition({
            nameCn: match.competition.nameCn,
            nameEn: match.competition.nameEn,
            code: match.competition.code,
            apiSportsLeagueId: match.competition.apiSportsLeagueId ?? null,
          })
        : null,
      season: match.season,
      homeTeam: this.presentation.enrichTeam({
        nameCn: match.homeTeam.nameCn,
        nameEn: match.homeTeam.nameEn ?? match.homeTeam.nameCn,
        externalId: match.homeTeam.externalId,
        apiFootballTeamId: match.homeTeam.apiFootballTeamId,
      }),
      awayTeam: this.presentation.enrichTeam({
        nameCn: match.awayTeam.nameCn,
        nameEn: match.awayTeam.nameEn ?? match.awayTeam.nameCn,
        externalId: match.awayTeam.externalId,
        apiFootballTeamId: match.awayTeam.apiFootballTeamId,
      }),
      statusCn: this.presentation.statusCn(String(match.status)),
      homeTeamSnapshot,
      awayTeamSnapshot,
      predictionPreview,
      freeSummary: freeSummaryForDisplay,
      isUnlocked,
      unlockPrice: {
        amount: unlockPricing.amountCents,
        currency: 'CNY',
        display: unlockPricing.display,
        tier: unlockPricing.tier,
      },
      sourceBadges: [],
      disclaimer: report?.disclaimer || DEFAULT_AI_DISCLAIMER,
    };

    if (!isUnlocked) {
      const out = {
        ...base,
        paidContent: null,
        playerSnapshots: [],
        refereeSnapshot: match.refereeSnapshot,
        weatherSnapshot: match.weatherSnapshot,
      };
      if (cacheKey) void this.redis.setJson(cacheKey, out, ttl);
      return out;
    }

    const out = {
      ...base,
      playerSnapshots: match.playerSnapshots,
      refereeSnapshot: match.refereeSnapshot,
      weatherSnapshot: match.weatherSnapshot,
      prediction: pred,
      playerIntelligence: match.playerIntelligence,
      tacticalScenarios: match.tacticalScenarios,
      fantasyAdvice: match.fantasyAdvice,
      headToHeadInsight: match.headToHead,
      socialGuide: match.socialGuide,
      report: report ?? null,
      sourceBadges: [],
    };
    if (cacheKey) void this.redis.setJson(cacheKey, out, ttl);
    return out;
  }

  async replaceTeamSnapshots(
    matchId: string,
    rows: Array<{
      teamId: string;
      isHome: boolean;
      recentForm?: string;
      goalsForAvg?: number;
      goalsAgainstAvg?: number;
      attackRating?: number;
      defenseRating?: number;
    }>,
  ) {
    await this.getRaw(matchId);
    await this.prisma.teamMatchSnapshot.deleteMany({ where: { matchId } });
    for (const r of rows) {
      await this.prisma.teamMatchSnapshot.create({
        data: {
          matchId,
          teamId: r.teamId,
          isHome: r.isHome,
          recentForm: r.recentForm,
          goalsForAvg: r.goalsForAvg,
          goalsAgainstAvg: r.goalsAgainstAvg,
          attackRating: r.attackRating ?? 50,
          defenseRating: r.defenseRating ?? 50,
        },
      });
    }
    const out = await this.prisma.teamMatchSnapshot.findMany({ where: { matchId } });
    await this.invalidateMatchCaches(matchId);
    return out;
  }

  async replacePlayerSnapshots(
    matchId: string,
    rows: Array<{
      playerId: string;
      teamId: string;
      expectedStartProbability?: number;
      riskLevel?: RiskLevel;
    }>,
  ) {
    await this.getRaw(matchId);
    await this.prisma.playerMatchSnapshot.deleteMany({ where: { matchId } });
    for (const r of rows) {
      await this.prisma.playerMatchSnapshot.create({
        data: {
          matchId,
          playerId: r.playerId,
          teamId: r.teamId,
          expectedStartProbability: r.expectedStartProbability,
          riskLevel: r.riskLevel ?? RiskLevel.UNKNOWN,
        },
      });
    }
    const out = await this.prisma.playerMatchSnapshot.findMany({
      where: { matchId },
      include: { player: true },
    });
    await this.invalidateMatchCaches(matchId);
    return out;
  }

  async updateMatch(
    id: string,
    body: {
      isFeatured?: boolean;
      status?: MatchStatus;
      homeScore?: number | null;
      awayScore?: number | null;
      round?: string | null;
      stadium?: string | null;
    },
  ) {
    await this.getRaw(id);
    const updated = await this.prisma.match.update({
      where: { id },
      data: body,
    });
    await this.invalidateMatchCaches(id);
    return updated;
  }

  /** C 端只读：赛前/临场赔率快照（含合规 disclaimer） */
  getOddsSnapshotsForMatch(matchId: string) {
    return this.oddsSnapshots.listForMatch(matchId);
  }

  async unlockStatus(matchId: string, userId: string) {
    const m = await this.getRaw(matchId);
    const isUnlocked =
      m.status === MatchStatus.FINISHED ||
      (await this.unlock.canAccessPaidIntel(userId, matchId));
    return { isUnlocked, loggedIn: true };
  }

  /**
   * C 端分析页只读聚合：解锁边界与 `GET /matches/:id/intel` 一致；未解锁不返回付费模块正文。
   */
  async getTacticsBundle(matchId: string, viewer: RequestUser | null) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, status: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    const isUnlocked = await this.resolveIntelUnlocked(match, viewer);
    const { legacy, sandbox } = await this.tactics.list(matchId);

    if (!isUnlocked) {
      return {
        matchId,
        isUnlocked: false,
        legacy: legacy.slice(0, 2).map((t) => ({
          id: t.id,
          title: t.title,
          scenarioType: t.scenarioType,
          probability: t.probability,
        })),
        sandbox: null,
        sandboxTeaser: sandbox?.contentJson
          ? {
              conclusion:
                typeof sandbox.contentJson === 'object' &&
                sandbox.contentJson !== null &&
                'conclusion' in (sandbox.contentJson as object)
                  ? String((sandbox.contentJson as { conclusion?: string }).conclusion ?? '').slice(
                      0,
                      200,
                    )
                  : null,
              locked: true as const,
            }
          : null,
      };
    }

    return {
      matchId,
      isUnlocked: true,
      legacy,
      sandbox: sandbox?.contentJson ?? null,
      sandboxMeta: sandbox
        ? { phase: sandbox.phase, schema: sandbox.schema, updatedAt: sandbox.updatedAt }
        : null,
    };
  }

  async getAnalysisPreview(matchId: string, viewer: RequestUser | null) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        activePrediction: true,
        tacticalSandbox: { select: { id: true, contentJson: true } },
        tacticalScenarios: {
          take: 8,
          orderBy: { probability: 'desc' },
          select: { id: true, title: true, scenarioType: true, probability: true },
        },
        fantasyAdvice: {
          select: {
            id: true,
            captainRecommendation: true,
            dataQuality: true,
          },
        },
        headToHead: {
          select: {
            id: true,
            summary: true,
            lastMeetingsCount: true,
            homeWins: true,
            draws: true,
            awayWins: true,
          },
        },
        playerIntelligence: {
          take: 6,
          orderBy: { startProbability: 'desc' },
          include: {
            player: {
              select: {
                id: true,
                nameCn: true,
                nameEn: true,
                position: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: { select: { playerIntelligence: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const isUnlocked = await this.resolveIntelUnlocked(
      { id: match.id, status: match.status },
      viewer,
    );

    const tacticsItems =
      isUnlocked ?
        match.tacticalScenarios
      : match.tacticalScenarios.slice(0, 2).map((t) => ({
          id: t.id,
          title: t.title,
          scenarioType: t.scenarioType,
        }));

    const mapIntelPlayer = (
      pl: {
        id: string;
        nameCn: string;
        nameEn: string;
        position: string | null;
        avatarUrl: string | null;
      },
      teaser: boolean,
    ) => {
      const base = {
        id: pl.id,
        nameCn: pl.nameCn,
        nameEn: teaser ? undefined : pl.nameEn,
        position: pl.position,
        avatarUrl: pl.avatarUrl,
        photoUrl: pl.avatarUrl,
      };
      return teaser ? { id: base.id, nameCn: base.nameCn, position: base.position, photoUrl: base.photoUrl } : base;
    };

    const playerIntelItems =
      isUnlocked ?
        match.playerIntelligence.map((pi) => ({
          id: pi.id,
          statusTag: pi.statusTag,
          startProbability: pi.startProbability,
          riskLevel: pi.riskLevel,
          aiSummary: pi.aiSummary,
          player: mapIntelPlayer(pi.player, false),
        }))
      : match.playerIntelligence.slice(0, 3).map((pi) => ({
          id: pi.id,
          statusTag: pi.statusTag,
          riskLevel: pi.riskLevel,
          locked: true as const,
          player: mapIntelPlayer(pi.player, true),
        }));

    const headToHeadPayload =
      match.headToHead ?
        isUnlocked ?
          match.headToHead
        : {
            id: match.headToHead.id,
            lastMeetingsCount: match.headToHead.lastMeetingsCount,
            homeWins: match.headToHead.homeWins,
            draws: match.headToHead.draws,
            awayWins: match.headToHead.awayWins,
            locked: true as const,
          }
      : null;

    const afBundlePred = await this.loadAfPredictionsForIntel(matchId);
    const afPreview =
      afBundlePred ? afBundleToPredictionPreview(afBundlePred) : null;

    const summary =
      (afPreview ?
        `官方倾向：主胜 ${Math.round(afPreview.homeWinProbability * 100)}% / 平 ${Math.round(afPreview.drawProbability * 100)}% / 客胜 ${Math.round(afPreview.awayWinProbability * 100)}%`
      : match.activePrediction?.explanation?.trim().slice(0, 320)) ||
      (headToHeadPayload && 'summary' in headToHeadPayload ?
        String(headToHeadPayload.summary || '').slice(0, 320)
      : '') ||
      null;

    const predictionBlock =
      afPreview ?
        {
          upsetIndex: afPreview.upsetIndex,
          confidence: afPreview.confidence,
          homeWinProbability: afPreview.homeWinProbability,
          awayWinProbability: afPreview.awayWinProbability,
          source: 'api-football' as const,
        }
      : match.activePrediction ?
        {
          upsetIndex: match.activePrediction.upsetIndex,
          confidence: match.activePrediction.confidence,
          homeWinProbability: match.activePrediction.homeWinProbability,
          awayWinProbability: match.activePrediction.awayWinProbability,
        }
      : null;

    return {
      meta: {
        contractVersion: 'analysis-preview-v1',
        deprecated: true,
        replacement: `/matches/${match.id}/detail-v2`,
        fieldBoundary:
          'Full paid modules: GET /matches/:id/intel; phase pages: pre-match/live/post-match; do not call Admin tactics/fantasy routes.',
      },
      matchId: match.id,
      status: match.status,
      kickoffTime: match.kickoffTime,
      isUnlocked,
      prediction: predictionBlock,
      tactics: {
        count: match.tacticalScenarios.length,
        items: tacticsItems,
        sandboxAvailable: !!match.tacticalSandbox,
        teaserTitle:
          match.tacticalScenarios[0]?.title ??
          (match.tacticalSandbox?.contentJson &&
          typeof match.tacticalSandbox.contentJson === 'object' &&
          'conclusion' in (match.tacticalSandbox.contentJson as object)
            ? String((match.tacticalSandbox.contentJson as { conclusion?: string }).conclusion).slice(
                0,
                60,
              )
            : null),
      },
      fantasy: match.fantasyAdvice
        ? isUnlocked ?
            {
              id: match.fantasyAdvice.id,
              captainRecommendation: match.fantasyAdvice.captainRecommendation,
              dataQuality: match.fantasyAdvice.dataQuality,
            }
          : { id: match.fantasyAdvice.id, locked: true as const }
        : null,
      headToHead: headToHeadPayload,
      head_to_head: headToHeadPayload,
      playerIntelligence: {
        count: match._count.playerIntelligence,
        items: playerIntelItems,
      },
      playerIntelligenceCount: match._count.playerIntelligence,
      summary: summary || undefined,
    };
  }

  private async getRaw(id: string) {
    const m = await this.prisma.match.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Match not found');
    return m;
  }

  /** 管理端写入或快照替换后：清 Redis 中本场次与列表/赛事侧相关键 */
  private async invalidateMatchCaches(matchId: string): Promise<void> {
    await this.matchCacheInvalidation.invalidateAfterMatchDataChange(matchId);
  }

  private pickPreMatchReportForIntel(
    reports: AiReport[],
    isAdmin: boolean,
  ): AiReport | undefined {
    const pre = reports.filter(
      (r) =>
        r.reportType === AiReportType.PRE_MATCH ||
        r.reportType == null,
    );
    const published = pre.find((r) => r.status === ReportStatus.PUBLISHED);
    const review = pre.find((r) => r.status === ReportStatus.REVIEW);
    const draft = pre.find((r) => r.status === ReportStatus.DRAFT);
    if (isAdmin) return draft ?? review ?? published;
    return published;
  }

  private pickTypedReport(
    reports: AiReport[],
    type: AiReportType,
    isAdmin: boolean,
  ): AiReport | undefined {
    const typed = reports.filter((r) => r.reportType === type);
    const published = typed.find((r) => r.status === ReportStatus.PUBLISHED);
    const review = typed.find((r) => r.status === ReportStatus.REVIEW);
    const draft = typed.find((r) => r.status === ReportStatus.DRAFT);
    if (isAdmin) return draft ?? review ?? published;
    return published;
  }
}
