import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, ReportStatus } from '@prisma/client';
import { ODDS_DISCLAIMER } from '../api-football/af-pre-match-mapper.util';
import { asRecord } from '../api-football/af-fixture-match-fields.util';
import { RequestUser } from '../common/types/request-user.type';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { MatchAfRawBundleService } from '../match-af-raw-bundle/match-af-raw-bundle.service';
import { MatchInjuriesService } from '../matches/match-injuries.service';
import { PaywallService } from '../paywall/paywall.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { buildPaidModule } from './build-paid-module.util';
import { MatchPresentationEnricherService } from '../localization/match-presentation-enricher.service';

@Injectable()
export class MatchDetailBffService {
  private readonly log = new Logger(MatchDetailBffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paywall: PaywallService,
    private readonly bundleSvc: MatchAfRawBundleService,
    private readonly injuriesSvc: MatchInjuriesService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly presentation: MatchPresentationEnricherService,
  ) {}

  async getDetailV2(matchId: string, viewer: RequestUser | null) {
    const matchRow = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { externalId: true },
    });
    if (!matchRow) throw new NotFoundException('Match not found');

    if (
      this.config.get<boolean>('enableAfRawBundle') !== false &&
      matchRow.externalId?.startsWith('af-f-')
    ) {
      void this.afSync.syncOnUserView(matchId).catch((e) => {
        this.log.warn(
          `syncOnUserView ${matchId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        season: true,
        tacticalScenarios: { orderBy: { probability: 'desc' }, take: 5 },
        playerIntelligence: {
          include: { player: true, team: true },
          orderBy: { startProbability: 'desc' },
          take: 20,
        },
        aiReports: {
          where: {
            reportType: 'PRE_MATCH',
            status: ReportStatus.PUBLISHED,
          },
          orderBy: { updatedAt: 'desc' },
          take: 3,
        },
        oddsSnapshots: { orderBy: { capturedAt: 'desc' }, take: 10 },
        oddsLiveSnapshots: { orderBy: { capturedAt: 'asc' }, take: 120 },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const access = await this.paywall.getMatchAccess(match, viewer);
    const tier = this.paywall.cacheTier(access);
    const cacheKey = `match-detail-v2:${matchId}:${tier}`;
    const cached = await this.redis.getJson<unknown>(cacheKey);
    if (cached) return cached;

    const bundle = await this.bundleSvc.getByMatchId(matchId);
    const fixtureItem = this.extractFixtureItem(bundle?.fixtureJson);
    const availability =
      bundle ?
        this.bundleSvc.buildCoverage(bundle)
      : {};

    const injuriesPack = await this.injuriesSvc.forMatch(matchId);
    const lineupsArr = this.jsonArray(bundle?.lineupsJson);
    const lineupsStatus = this.lineupsStatus(lineupsArr);

    const canPredictions = access.permissions.predictions;
    const canOdds = access.permissions.odds;
    const canAi = access.permissions.aiReports;

    const predictionsRaw = bundle?.predictionsJson ?? null;
    const predStatus = predictionsRaw ?
      'present'
    : bundle?.predictionsJson === null && bundle ?
      'empty'
    : 'missing';

    const oddsRaw = bundle?.oddsLatestJson;
    const oddsStatus =
      oddsRaw == null && !bundle ? 'missing'
      : Array.isArray(oddsRaw) && oddsRaw.length === 0 ? 'empty'
      : oddsRaw != null ? 'present'
      : 'missing';

    const payload = {
      schema: 'match-detail-v2' as const,
      matchId,
      fixtureId: bundle?.fixtureId ?? null,
      status: match.status,
      serverTime: new Date().toISOString(),
      isUnlocked: access.isUnlocked,
      access,
      basic: this.buildBasic(match, fixtureItem),
      freeModules: {
        standingsBrief: this.standingsBrief(bundle),
        recentResultsBrief: this.recentResultsBrief(
          bundle?.h2hJson,
          fixtureItem,
        ),
        headToHeadBrief: this.headToHeadBrief(bundle?.h2hJson, access.permissions.headToHeadBrief),
        injuries: {
          available: access.permissions.injuries && injuriesPack.items.length > 0,
          source: 'api-football' as const,
          data: access.permissions.injuries ? injuriesPack.items : [],
        },
        lineupsStatus,
        lineups:
          access.permissions.lineups && lineupsStatus.status === 'present' ?
            { source: 'api-football' as const, data: lineupsArr }
          : undefined,
      },
      paidModules: {
        predictions: buildPaidModule({
          locked: !canPredictions,
          hasData: predStatus === 'present',
          status: predStatus,
          title: '官方预测数据',
          description: '解锁后查看胜平负倾向、进球预测、双方对比与官方建议',
          source: 'api-football',
          data: predictionsRaw,
        }),
        odds: buildPaidModule({
          locked: !canOdds,
          hasData: oddsStatus === 'present',
          status: oddsStatus,
          title: '赔率与指数',
          description: `解锁后查看官方赔率、赛前快照与赛中序列。${ODDS_DISCLAIMER}`,
          source: 'api-football',
          data:
            canOdds && oddsStatus === 'present' ?
              {
                latest: oddsRaw,
                prematchSnapshots: match.oddsSnapshots
                  .filter((s) => s.phase === 'T24' || s.phase === 'T1')
                  .map((s) => ({
                    phase: s.phase,
                    capturedAt: s.capturedAt.toISOString(),
                    markets: s.marketsJson,
                  })),
                liveSnapshots: match.oddsLiveSnapshots.map((s) => ({
                  capturedAt: s.capturedAt.toISOString(),
                  markets: s.marketsJson,
                })),
                disclaimer: ODDS_DISCLAIMER,
              }
            : null,
        }),
        aiReports: buildPaidModule({
          locked: !canAi,
          hasData: match.aiReports.length > 0,
          status: match.aiReports.length > 0 ? 'present' : 'missing',
          title: 'AI 深度分析',
          source: 'deepseek',
          data: null,
          description: '解锁后查看赛前长文与结构化洞察',
        }),
        tacticalScript: buildPaidModule({
          locked: !access.permissions.tacticalScript,
          hasData: match.tacticalScenarios.length > 0,
          status: match.tacticalScenarios.length > 0 ? 'present' : 'missing',
          title: '战术剧本',
          source: 'deepseek',
          data:
            access.permissions.tacticalScript ?
              match.tacticalScenarios.map((t) => ({
                id: t.id,
                scenarioType: t.scenarioType,
                title: t.title,
                probability: t.probability,
                precondition: t.precondition,
                process: t.process,
                possibleScore: t.possibleScore,
                timeline: t.timeline,
                source: 'deepseek',
              }))
            : null,
        }),
        playerIntelligence: buildPaidModule({
          locked: !access.permissions.playerIntelligence,
          hasData: match.playerIntelligence.length > 0,
          status: match.playerIntelligence.length > 0 ? 'present' : 'missing',
          title: '球员情报',
          source: 'deepseek',
          data:
            access.permissions.playerIntelligence ?
              match.playerIntelligence.map((p) => ({
                playerId: p.playerId,
                nameCn: p.player.nameCn,
                nameEn: p.player.nameEn,
                statusTag: p.statusTag,
                startProbability: p.startProbability,
                aiSummary: p.aiSummary,
                source: 'deepseek',
              }))
            : null,
        }),
      },
      availability,
      paywall: this.buildPaywallBlock(match, access.isUnlocked),
      updatedAt: {
        bundle: bundle?.syncedAt?.toISOString() ?? null,
        injuries: null,
      },
    };

    if (canAi && match.aiReports.length) {
      const reports = match.aiReports.map((r) => ({
        id: r.id,
        reportType: r.reportType,
        freeSummary: r.freeSummary,
        source: 'deepseek' as const,
      }));
      payload.paidModules.aiReports = {
        ...payload.paidModules.aiReports,
        data: reports,
      };
    }

    const ttl = this.cacheTtlSec(match.status);
    void this.redis.setJson(cacheKey, payload, ttl);
    return payload;
  }

  private buildPaywallBlock(
    match: { isFeatured: boolean },
    isUnlocked: boolean,
  ) {
    const price = this.paywall.unlockPrice(match);
    return {
      unlockType: 'single_match' as const,
      unlockPrice: price,
      price: price.amountCents,
      currency: price.currency ?? 'CNY',
      display: price.display,
      buttonText: '解锁本场预测与深度分析',
      benefits: [
        '官方赛果预测全文',
        '赔率与指数数据',
        'AI 战术剧本与球员情报',
        '赛前/赛后深度长文',
      ],
      cta: isUnlocked ? null : '解锁查看官方预测、赔率与 AI 深度分析',
    };
  }

  private cacheTtlSec(status: MatchStatus): number {
    if (status === MatchStatus.LIVE) {
      return this.config.get<number>('cacheMatchLiveTtlSec') ?? 15;
    }
    if (status === MatchStatus.FINISHED) {
      return 600;
    }
    return this.config.get<number>('cacheMatchPhasePreTtlSec') ?? 60;
  }

  private extractFixtureItem(fixtureJson: unknown): Record<string, unknown> | null {
    if (!fixtureJson) return null;
    if (Array.isArray(fixtureJson)) {
      return asRecord(fixtureJson[0]);
    }
    return asRecord(fixtureJson);
  }

  private buildBasic(
    match: {
      status: MatchStatus;
      kickoffTime: Date;
      homeScore: number | null;
      awayScore: number | null;
      stadium: string | null;
      homeTeam: { nameCn: string; nameEn: string };
      awayTeam: { nameCn: string; nameEn: string };
      competition: {
        nameCn: string;
        nameEn: string;
        code: string | null;
        apiSportsLeagueId?: number | null;
      } | null;
    },
    fixtureItem: Record<string, unknown> | null,
  ) {
    const teams = asRecord(fixtureItem?.teams);
    const home = asRecord(teams?.home);
    const away = asRecord(teams?.away);
    const league = asRecord(fixtureItem?.league);
    const fx = asRecord(fixtureItem?.fixture);
    const homeDn = this.presentation.enrichTeam({
      nameCn: match.homeTeam.nameCn,
      nameEn: match.homeTeam.nameEn,
    });
    const awayDn = this.presentation.enrichTeam({
      nameCn: match.awayTeam.nameCn,
      nameEn: match.awayTeam.nameEn,
    });
    const compDn =
      match.competition ?
        this.presentation.enrichCompetition({
          nameCn: match.competition.nameCn,
          nameEn: match.competition.nameEn,
          code: match.competition.code,
          apiSportsLeagueId: match.competition.apiSportsLeagueId ?? null,
        })
      : null;
    return {
      source: 'api-football',
      status: match.status,
      statusCn: this.presentation.statusCn(String(match.status)),
      kickoffTime: match.kickoffTime.toISOString(),
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      stadium: match.stadium,
      homeTeam: {
        nameCn: homeDn.nameCn ?? match.homeTeam.nameCn,
        nameEn: match.homeTeam.nameEn,
        displayName: homeDn.displayName,
        translationStatus: homeDn.translationStatus,
        logo: home?.logo ?? null,
      },
      awayTeam: {
        nameCn: awayDn.nameCn ?? match.awayTeam.nameCn,
        nameEn: match.awayTeam.nameEn,
        displayName: awayDn.displayName,
        translationStatus: awayDn.translationStatus,
        logo: away?.logo ?? null,
      },
      competition: {
        nameCn: compDn?.nameCn ?? match.competition?.nameCn ?? null,
        code: match.competition?.code ?? null,
        displayName: compDn?.displayName ?? match.competition?.nameCn ?? null,
        translationStatus: compDn?.translationStatus ?? 'fallback',
        name: typeof league?.name === 'string' ? league.name : null,
      },
      venue: asRecord(fx?.venue),
      referee: typeof fx?.referee === 'string' ? fx.referee : null,
    };
  }

  private jsonArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
  }

  private lineupsStatus(lineups: unknown[]) {
    if (lineups.length > 0) {
      return {
        available: true,
        status: 'present' as const,
        title: '官方阵容',
        description: undefined,
      };
    }
    return {
      available: false,
      status: 'empty' as const,
      title: '预计阵容暂无',
      description: '官方暂未公布本场阵容信息',
    };
  }

  private standingsBrief(bundle: { homeTeamStatsJson?: unknown; awayTeamStatsJson?: unknown } | null) {
    if (!bundle) return { available: false };
    const home = asRecord(bundle.homeTeamStatsJson);
    const away = asRecord(bundle.awayTeamStatsJson);
    if (!home && !away) return { available: false };
    return {
      available: true,
      home: home ? { form: home.form, rank: home.rank } : undefined,
      away: away ? { form: away.form, rank: away.rank } : undefined,
    };
  }

  private headToHeadBrief(h2hJson: unknown, allowed: boolean) {
    if (!allowed) return { available: false, items: [] };
    const items = this.jsonArray(h2hJson).slice(0, 10);
    return { available: items.length > 0, items };
  }

  private recentResultsBrief(
    h2hJson: unknown,
    fixtureItem: Record<string, unknown> | null,
  ) {
    const items = this.jsonArray(h2hJson);
    if (!items.length) return { available: false as const };

    const teams = asRecord(fixtureItem?.teams);
    const homeId = asRecord(teams?.home)?.id as number | undefined;
    const awayId = asRecord(teams?.away)?.id as number | undefined;

    const isFinished = (row: unknown) => {
      const fx = asRecord(asRecord(row)?.fixture);
      const st = asRecord(fx?.status);
      const short = st?.short;
      return short === 'FT' || short === 'AET' || short === 'PEN';
    };

    const mapRow = (row: unknown) => {
      const r = asRecord(row);
      const fx = asRecord(r?.fixture);
      const goals = asRecord(r?.goals);
      const t = asRecord(r?.teams);
      const h = asRecord(t?.home);
      const a = asRecord(t?.away);
      return {
        date: typeof fx?.date === 'string' ? fx.date : null,
        homeName: typeof h?.name === 'string' ? h.name : null,
        awayName: typeof a?.name === 'string' ? a.name : null,
        homeGoals: goals?.home ?? null,
        awayGoals: goals?.away ?? null,
      };
    };

    const finished = items.filter(isFinished);
    const homeRows =
      homeId != null ?
        finished
          .filter((row) => (asRecord(asRecord(row)?.teams)?.home as { id?: number })?.id === homeId)
          .slice(0, 5)
          .map(mapRow)
      : [];
    const awayRows =
      awayId != null ?
        finished
          .filter((row) => (asRecord(asRecord(row)?.teams)?.home as { id?: number })?.id === awayId)
          .slice(0, 5)
          .map(mapRow)
      : [];

    if (!homeRows.length && !awayRows.length) {
      return { available: false as const };
    }
    return {
      available: true as const,
      home: homeRows.length ? homeRows : undefined,
      away: awayRows.length ? awayRows : undefined,
    };
  }
}
