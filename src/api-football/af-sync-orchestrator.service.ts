import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSourceType, MatchStatus, Prisma } from '@prisma/client';
import {
  parseAfFixtureIdFromExternalId,
  parseAfTeamIdFromExternalId,
} from './af-fixture-match-fields.util';
import { ApiFootballService } from './api-football.service';
import { MatchAfFactsSyncService } from './match-af-facts-sync.service';
import { MatchOddsLiveSyncService } from './match-odds-live-sync.service';
import { MatchAfRawBundleService } from '../match-af-raw-bundle/match-af-raw-bundle.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizeInjuriesResponse,
  splitInjuriesBySide,
} from '../matches/af-injuries.mapper';
import type { BundleJsonField } from '../match-af-raw-bundle/af-availability.util';
import { bundleFieldsForIntelHash } from './ingest-endpoint.registry';
import { sha256StableJson } from '../common/utils/stable-content-hash.util';
import { MatchIntelFreshnessService } from '../match-intel/match-intel-freshness.service';
import { LocalizationPostIngestHook } from '../localization/localization-post-ingest.hook';

export type AfSyncSingleResult = {
  matchId: string;
  fixtureId: number;
  endpoints: Record<string, string>;
  factsSync?: Record<string, unknown>;
};

@Injectable()
export class AfSyncOrchestrator {
  private readonly log = new Logger(AfSyncOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly api: ApiFootballService,
    private readonly bundleSvc: MatchAfRawBundleService,
    private readonly factsSync: MatchAfFactsSyncService,
    private readonly oddsLiveSync: MatchOddsLiveSyncService,
    private readonly intelFreshness: MatchIntelFreshnessService,
    private readonly l10nHook: LocalizationPostIngestHook,
  ) {}

  async syncSingleMatchFull(
    matchId: string,
    opts?: { force?: boolean; delayMs?: number },
  ): Promise<AfSyncSingleResult> {
    if (this.config.get<boolean>('enableAfRawBundle') === false) {
      throw new BadRequestException('ENABLE_AF_RAW_BUNDLE is disabled');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { externalId: true } },
        awayTeam: { select: { externalId: true } },
        competition: { select: { externalId: true } },
        season: { select: { code: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const fixtureId = parseAfFixtureIdFromExternalId(match.externalId);
    if (fixtureId == null) {
      throw new BadRequestException('Match.externalId must be af-f-{fixtureId}');
    }

    const homeTeamId = parseAfTeamIdFromExternalId(match.homeTeam.externalId);
    const awayTeamId = parseAfTeamIdFromExternalId(match.awayTeam.externalId);
    const delay = Math.min(10_000, Math.max(0, opts?.delayMs ?? 400));

    await this.bundleSvc.ensureBundle(matchId, fixtureId);
    const endpoints: Record<string, string> = {};

    const leagueId = this.parseLeagueId(match.competition?.externalId);
    const seasonYear = this.parseSeasonYear(match.season?.code, match.kickoffTime);

    await this.syncEndpoint(matchId, fixtureId, '/fixtures', async () => {
      const { item, raw } = await this.api.getFixtureById(fixtureId);
      const val = item ?? raw;
      return {
        value: val as Prisma.InputJsonValue,
        status: item ? 'success' : 'empty',
        httpStatus: 200,
        responseSize: JSON.stringify(val).length,
      };
    }, endpoints, 'fixtureJson');

    if (delay > 0) await this.api.sleep(delay);

    await this.syncEndpoint(matchId, fixtureId, '/fixtures/lineups', async () => {
      const pack = await this.api.getFixtureLineups(fixtureId);
      return this.arrayResult(pack.response, pack.status);
    }, endpoints, 'lineupsJson');

    if (delay > 0) await this.api.sleep(delay);
    await this.syncEndpoint(matchId, fixtureId, '/fixtures/events', async () => {
      const pack = await this.api.getFixtureEvents(fixtureId);
      return this.arrayResult(pack.response, pack.status);
    }, endpoints, 'eventsJson');

    if (delay > 0) await this.api.sleep(delay);
    await this.syncEndpoint(matchId, fixtureId, '/fixtures/statistics', async () => {
      const pack = await this.api.getFixtureStatistics(fixtureId);
      return this.arrayResult(pack.response, pack.status);
    }, endpoints, 'statisticsJson');

    if (delay > 0) await this.api.sleep(delay);
    await this.syncEndpoint(matchId, fixtureId, '/fixtures/players', async () => {
      const pack = await this.api.getFixturePlayers(fixtureId);
      return this.arrayResult(pack.response, pack.status);
    }, endpoints, 'playersJson');

    if (delay > 0) await this.api.sleep(delay);
    await this.syncEndpoint(matchId, fixtureId, '/injuries', async () => {
      const pack = await this.api.getInjuries({ fixture: fixtureId });
      const normalized = normalizeInjuriesResponse(pack.response);
      const { homeInjuries, awayInjuries } = splitInjuriesBySide(
        normalized,
        homeTeamId,
        awayTeamId,
      );
      const factsPayload = {
        homeInjuries,
        awayInjuries,
        items: [...homeInjuries, ...awayInjuries],
        raw: pack.response,
        syncedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue;
      await this.prisma.matchFacts.upsert({
        where: { matchId },
        create: {
          matchId,
          injuriesJson: factsPayload,
          primaryProvider: DataSourceType.API_FOOTBALL,
        },
        update: { injuriesJson: factsPayload },
      });
      return this.arrayResult(pack.response, pack.status);
    }, endpoints, 'injuriesJson');

    if (delay > 0) await this.api.sleep(delay);
    await this.syncEndpoint(matchId, fixtureId, '/predictions', async () => {
      const pack = await this.api.getPredictions(fixtureId);
      const first = pack.response[0] ?? null;
      return {
        value: first as Prisma.InputJsonValue,
        status: first ? 'success' : 'empty',
        httpStatus: pack.status,
        responseSize: first ? JSON.stringify(first).length : 0,
      };
    }, endpoints, 'predictionsJson');

    if (delay > 0) await this.api.sleep(delay);
    await this.syncEndpoint(matchId, fixtureId, '/odds', async () => {
      const pack = await this.api.getOdds(fixtureId);
      return this.arrayResult(pack.response, pack.status);
    }, endpoints, 'oddsLatestJson');

    if (homeTeamId != null && awayTeamId != null) {
      if (delay > 0) await this.api.sleep(delay);
      await this.syncEndpoint(matchId, fixtureId, '/fixtures/headtohead', async () => {
        const pack = await this.api.getHeadToHead(homeTeamId, awayTeamId, 10);
        return this.arrayResult(pack.response, pack.status);
      }, endpoints, 'h2hJson');
    }

    if (homeTeamId != null) {
      if (delay > 0) await this.api.sleep(delay);
      await this.syncEndpoint(matchId, fixtureId, '/coachs?home', async () => {
        const pack = await this.api.getCoachs(homeTeamId);
        return this.arrayResult(pack.response, pack.status);
      }, endpoints, 'homeCoachJson');
    }

    if (awayTeamId != null) {
      if (delay > 0) await this.api.sleep(delay);
      await this.syncEndpoint(matchId, fixtureId, '/coachs?away', async () => {
        const pack = await this.api.getCoachs(awayTeamId);
        return this.arrayResult(pack.response, pack.status);
      }, endpoints, 'awayCoachJson');
    }

    if (homeTeamId != null && leagueId != null && seasonYear != null) {
      if (delay > 0) await this.api.sleep(delay);
      await this.syncEndpoint(matchId, fixtureId, '/teams/statistics?home', async () => {
        const pack = await this.api.getTeamStatistics({
          teamId: homeTeamId,
          league: leagueId,
          season: seasonYear,
        });
        const val = pack.statistics ?? pack.raw;
        return {
          value: val as Prisma.InputJsonValue,
          status: pack.statistics ? 'success' : 'empty',
          httpStatus: pack.status,
          responseSize: JSON.stringify(val).length,
        };
      }, endpoints, 'homeTeamStatsJson');
    }

    if (awayTeamId != null && leagueId != null && seasonYear != null) {
      if (delay > 0) await this.api.sleep(delay);
      await this.syncEndpoint(matchId, fixtureId, '/teams/statistics?away', async () => {
        const pack = await this.api.getTeamStatistics({
          teamId: awayTeamId,
          league: leagueId,
          season: seasonYear,
        });
        const val = pack.statistics ?? pack.raw;
        return {
          value: val as Prisma.InputJsonValue,
          status: pack.statistics ? 'success' : 'empty',
          httpStatus: pack.status,
          responseSize: JSON.stringify(val).length,
        };
      }, endpoints, 'awayTeamStatsJson');
    }

    if (homeTeamId != null) {
      if (delay > 0) await this.api.sleep(delay);
      await this.syncEndpoint(matchId, fixtureId, '/players/squads?home', async () => {
        const pack = await this.api.getPlayerSquads(homeTeamId);
        return this.arrayResult(pack.response, pack.status);
      }, endpoints, 'homeSquadJson');
    }

    if (awayTeamId != null) {
      if (delay > 0) await this.api.sleep(delay);
      await this.syncEndpoint(matchId, fixtureId, '/players/squads?away', async () => {
        const pack = await this.api.getPlayerSquads(awayTeamId);
        return this.arrayResult(pack.response, pack.status);
      }, endpoints, 'awaySquadJson');
    }

    let factsSync: Record<string, unknown> | undefined;
    if (this.config.get<boolean>('enableAfFactsDualWrite') === true) {
      try {
        factsSync = (
          await this.factsSync.syncByMatchId(matchId, {
            force: opts?.force,
            delayMs: delay,
          })
        ).detail;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`MatchFacts dual-write skipped for ${matchId}: ${msg}`);
        factsSync = { error: msg };
      }
    } else {
      factsSync = { skipped: true, reason: 'ENABLE_AF_FACTS_DUAL_WRITE=false' };
    }

    await this.refreshBundleEndpointHashes(matchId);
    await this.intelFreshness.refreshIntelContentHash(matchId);

    const matchGeo = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, city: true, venueName: true },
    });
    if (matchGeo) {
      await this.l10nHook.onMatchUpsert(matchGeo);
    }

    return { matchId, fixtureId, endpoints, factsSync };
  }

  private async refreshBundleEndpointHashes(matchId: string) {
    const bundle = await this.prisma.matchAfRawBundle.findUnique({
      where: { matchId },
    });
    if (!bundle) return;
    const fieldKeys = [
      ...bundleFieldsForIntelHash(),
      'homeTeamStatsJson',
      'awayTeamStatsJson',
      'homeCoachJson',
      'awayCoachJson',
    ];
    const hashes: Record<string, string> = {};
    for (const key of fieldKeys) {
      const val = (bundle as Record<string, unknown>)[key];
      if (val != null) hashes[key] = sha256StableJson(val);
    }
    await this.prisma.matchAfRawBundle.update({
      where: { matchId },
      data: { endpointHashes: hashes as Prisma.InputJsonValue },
    });
  }

  async getCoverage(matchId: string) {
    const bundle = await this.bundleSvc.getByMatchId(matchId);
    if (!bundle) return { matchId, coverage: null };
    return {
      matchId,
      fixtureId: bundle.fixtureId,
      syncedAt: bundle.syncedAt?.toISOString() ?? null,
      coverage: this.bundleSvc.buildCoverage(bundle),
    };
  }

  async listSyncLogs(matchId: string, limit = 50) {
    return this.prisma.afSyncLog.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async listGlobalSyncLogs(limit = 50, endpoint?: string) {
    return this.prisma.afSyncLog.findMany({
      where: endpoint ? { endpoint } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, limit),
    });
  }

  private async syncEndpoint(
    matchId: string,
    fixtureId: number,
    endpoint: string,
    fetcher: () => Promise<{
      value: Prisma.InputJsonValue;
      status: 'success' | 'empty';
      httpStatus: number;
      responseSize: number;
    }>,
    endpoints: Record<string, string>,
    field?: BundleJsonField,
  ) {
    const startedAt = new Date();
    try {
      const result = await fetcher();
      if (field) {
        await this.bundleSvc.patchField(matchId, field, result.value, {
          syncStatus: result.status,
        });
      }
      endpoints[endpoint] = result.status;
      await this.writeAfSyncLog({
        endpoint,
        matchId,
        fixtureId,
        httpStatus: result.httpStatus,
        status: result.status,
        responseSize: result.responseSize,
        startedAt,
        finishedAt: new Date(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      endpoints[endpoint] = 'error';
      if (field) {
        await this.bundleSvc.patchField(matchId, field, null, {
          syncStatus: 'error',
          errorMessage: msg.slice(0, 500),
        });
      }
      await this.writeAfSyncLog({
        endpoint,
        matchId,
        fixtureId,
        httpStatus: null,
        status: 'error',
        errorMessage: msg,
        startedAt,
        finishedAt: new Date(),
      });
    }
  }

  private arrayResult(
    response: unknown[],
    httpStatus: number,
  ): {
    value: Prisma.InputJsonValue;
    status: 'success' | 'empty';
    httpStatus: number;
    responseSize: number;
  } {
    return {
      value: response as Prisma.InputJsonValue,
      status: response.length > 0 ? 'success' : 'empty',
      httpStatus,
      responseSize: JSON.stringify(response).length,
    };
  }

  private async writeAfSyncLog(args: {
    endpoint: string;
    matchId: string;
    fixtureId: number;
    httpStatus: number | null;
    status: string;
    responseSize?: number;
    errorMessage?: string;
    startedAt: Date;
    finishedAt: Date;
  }) {
    await this.prisma.afSyncLog.create({
      data: {
        endpoint: args.endpoint,
        matchId: args.matchId,
        fixtureId: args.fixtureId,
        httpStatus: args.httpStatus ?? undefined,
        status: args.status,
        responseSize: args.responseSize,
        errorMessage: args.errorMessage,
        durationMs: args.finishedAt.getTime() - args.startedAt.getTime(),
        startedAt: args.startedAt,
        finishedAt: args.finishedAt,
      },
    });
  }

  private parseLeagueId(competitionExternalId: string | null | undefined): number | null {
    if (!competitionExternalId) return null;
    const m = /^af-l-(\d+)$/.exec(competitionExternalId.trim());
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  private parseSeasonYear(code: string | null | undefined, kickoff: Date): number {
    const parsed = parseInt((code ?? '').replace(/\D/g, '').slice(0, 4), 10);
    if (Number.isFinite(parsed) && parsed > 1900) return parsed;
    return kickoff.getUTCFullYear();
  }

  /** 用户查看 detail-v2 时插队同步（轻量：仅当 bundle 缺失或 stale） */
  async syncOnUserView(matchId: string): Promise<void> {
    const bundle = await this.bundleSvc.getByMatchId(matchId);
    const stale =
      !bundle?.syncedAt ||
      Date.now() - bundle.syncedAt.getTime() > 6 * 3600_000;
    if (!bundle || stale) {
      await this.syncSingleMatchFull(matchId, { delayMs: 300 });
    }
  }

  async syncPreMatchWindow(opts?: {
    lookaheadHours?: number;
    maxMatches?: number;
    leagueExternalPrefix?: string;
  }): Promise<{ attempted: number; ok: number; failed: number }> {
    const lookahead = opts?.lookaheadHours ?? 240;
    const max = opts?.maxMatches ?? 30;
    const until = new Date(Date.now() + lookahead * 3600_000);
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.SCHEDULED,
        kickoffTime: { lte: until, gte: new Date() },
        externalId: { startsWith: 'af-f-' },
      },
      orderBy: { kickoffTime: 'asc' },
      take: max,
      select: { id: true },
    });
    let ok = 0;
    let failed = 0;
    for (const m of matches) {
      try {
        await this.syncSingleMatchFull(m.id, { delayMs: 500 });
        ok++;
      } catch (e) {
        failed++;
        this.log.warn(`syncPreMatchWindow ${m.id}: ${String(e).slice(0, 80)}`);
      }
    }
    return { attempted: matches.length, ok, failed };
  }

  async syncLiveMatches(): Promise<{ attempted: number; ok: number }> {
    const matches = await this.prisma.match.findMany({
      where: { status: MatchStatus.LIVE, externalId: { startsWith: 'af-f-' } },
      take: 20,
      select: { id: true },
    });
    let ok = 0;
    for (const m of matches) {
      try {
        await this.syncSingleMatchFull(m.id, { delayMs: 250 });
        try {
          await this.oddsLiveSync.captureLiveOddsForMatch(m.id);
        } catch (e) {
          this.log.warn(
            `live odds ${m.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        ok++;
      } catch {
        /* keep old bundle */
      }
    }
    return { attempted: matches.length, ok };
  }

  async syncFinishedMatches(opts?: { lookbackHours?: number }): Promise<{
    attempted: number;
    ok: number;
  }> {
    const lookback = opts?.lookbackHours ?? 48;
    const since = new Date(Date.now() - lookback * 3600_000);
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.FINISHED,
        kickoffTime: { gte: since },
        externalId: { startsWith: 'af-f-' },
      },
      take: 25,
      select: { id: true },
    });
    let ok = 0;
    for (const m of matches) {
      try {
        await this.syncSingleMatchFull(m.id, { delayMs: 500, force: true });
        ok++;
      } catch {
        /* skip */
      }
    }
    return { attempted: matches.length, ok };
  }

  async syncLeagueCatalog(competitionCode: string, season: number) {
    const row = await this.prisma.competition.findFirst({
      where: { code: competitionCode },
      select: { externalId: true },
    });
    const lid = this.parseLeagueId(row?.externalId ?? null);
    if (lid == null) return { skipped: true, reason: 'no af-l-* on competition' };

    const payload: Prisma.LeagueAfCacheCreateInput = {
      competitionCode,
      season,
    };
    const result: Record<string, number> = {};

    try {
      const standings = await this.api.getStandings(lid, season);
      payload.standingsJson = standings.response as Prisma.InputJsonValue;
      result.standingsRows = standings.response.length;
    } catch (e) {
      this.log.warn(
        `standings ${competitionCode}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const leagueFetches: Array<{
      key: 'topAssistsJson' | 'topYellowCardsJson' | 'topRedCardsJson' | 'fixtureRoundsJson';
      fn: () => Promise<{ response: unknown[] }>;
      countKey: string;
    }> = [
      {
        key: 'topAssistsJson',
        fn: () => this.api.getTopAssists(lid, season),
        countKey: 'topAssistsRows',
      },
      {
        key: 'topYellowCardsJson',
        fn: () => this.api.getTopYellowCards(lid, season),
        countKey: 'topYellowRows',
      },
      {
        key: 'topRedCardsJson',
        fn: () => this.api.getTopRedCards(lid, season),
        countKey: 'topRedRows',
      },
      {
        key: 'fixtureRoundsJson',
        fn: () => this.api.getFixtureRounds(lid, season),
        countKey: 'roundsRows',
      },
    ];

    for (const item of leagueFetches) {
      try {
        const pack = await item.fn();
        payload[item.key] = pack.response as Prisma.InputJsonValue;
        result[item.countKey] = pack.response.length;
      } catch (e) {
        this.log.warn(
          `${item.key} ${competitionCode}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    await this.prisma.leagueAfCache.upsert({
      where: { competitionCode_season: { competitionCode, season } },
      create: payload,
      update: payload,
    });

    return { competitionCode, season, ...result };
  }
}
