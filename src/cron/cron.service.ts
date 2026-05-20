import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PublicSourcesService } from '../public-sources/public-sources.service';
import { WeatherService } from '../weather/weather.service';
import { AutoAiReportBatchService } from '../ai-report/auto-ai-report-batch.service';
import { AutoPostMatchReportBatchService } from '../ai-report/auto-post-match-report-batch.service';
import { AutoIntelBatchService } from '../auto-intel/auto-intel-batch.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { AfCatalogSyncService } from '../api-football/af-catalog-sync.service';
import { MatchOddsLiveSyncService } from '../api-football/match-odds-live-sync.service';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';
import { PredictionGradingService } from '../prediction/prediction-grading.service';
import { PredictionService } from '../prediction/prediction.service';
import { MatchLiveFactsIngestService } from '../match-live/match-live-facts-ingest.service';
import { LiveStandingsTickService } from '../data-pipeline/live-standings-tick.service';
import { LeaguesStandingsService } from '../leagues/leagues-standings.service';
import { RedisService } from '../redis/redis.service';
import { WorldCupCronService } from '../world-cup/world-cup-cron.service';

@Injectable()
export class CronService {
  private readonly log = new Logger(CronService.name);
  private liveStatusPollRunning = false;
  private liveFactsIngestRunning = false;
  private livePlayersIngestRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly publicSources: PublicSourcesService,
    private readonly autoIntel: AutoIntelBatchService,
    private readonly autoAiReport: AutoAiReportBatchService,
    private readonly apiFootballIngest: ApiFootballIngestService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly afCatalog: AfCatalogSyncService,
    private readonly oddsLiveSync: MatchOddsLiveSyncService,
    private readonly afQuota: ApiFootballQuotaService,
    private readonly prediction: PredictionService,
    private readonly predictionGrading: PredictionGradingService,
    private readonly liveFactsIngest: MatchLiveFactsIngestService,
    private readonly liveStandingsTick: LiveStandingsTickService,
    private readonly autoPostMatchReport: AutoPostMatchReportBatchService,
    private readonly leaguesStandings: LeaguesStandingsService,
    private readonly redis: RedisService,
    private readonly worldCupCron: WorldCupCronService,
  ) {}

  private postMatchReportCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enablePostMatchReportCron') === true
    );
  }

  private afLiveFactsCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enableAfLiveFactsCron') === true
    );
  }

  private afLivePlayersCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enableAfLivePlayersCron') === true
    );
  }

  private liveStandingsTickEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enableLiveStandingsTick') === true
    );
  }

  private predictionLockCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enablePredictionLockCron') === true
    );
  }

  private predictionGradingCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enablePredictionGradingCron') === true
    );
  }

  private afMatchFactsCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enableAfMatchFactsCron') === true
    );
  }

  private afPreMatchCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enableAfPreMatchCron') === true
    );
  }

  private enabled() {
    return this.config.get<boolean>('enableCronSync') === true;
  }

  private publicSourcesScheduleEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enablePublicSourceFetch') === true
    );
  }

  private matchLiveFastPollEnabled() {
    return (
      this.enabled() &&
      this.config.get<boolean>('enableMatchFdLivePoll') === true &&
      this.config.get<boolean>('enableMatchLiveFastPoll') === true
    );
  }

  private afNearWindowPollEnabled() {
    return this.enabled() && this.config.get<boolean>('enableMatchFdLivePoll') === true;
  }

  private currentSeasonYear(): number {
    return new Date().getFullYear();
  }

  private async logCron(
    endpoint: string,
    success: boolean,
    message: string,
    statusCode?: number,
  ) {
    try {
      await this.prisma.apiLog.create({
        data: {
          provider: 'cron',
          endpoint,
          method: 'CRON',
          statusCode,
          success,
          message,
        },
      });
    } catch (e) {
      this.log.warn(`apiLog write failed: ${String(e)}`);
    }
  }

  private async quotaAllows(minRemaining = 5): Promise<boolean> {
    const snap = await this.afQuota.snapshot();
    if (snap.remaining < minRemaining) {
      await this.logCron(
        'af-quota-guard',
        false,
        `skip: used=${snap.used} limit=${snap.limit}`,
        429,
      );
      return false;
    }
    return true;
  }

  /** 每天 03:00 — 五大联赛赛程（API-Football fixtures） */
  @Cron('0 3 * * *')
  async syncTopFiveMatches() {
    if (!this.enabled()) return;
    if (!(await this.quotaAllows(20))) return;
    const season = this.currentSeasonYear();
    try {
      const out = await this.apiFootballIngest.syncFixtures({
        competitionCodes: ['PL', 'PD', 'SA', 'BL1', 'FL1'],
        season,
        delayBetweenRequestsMs: 1400,
      });
      await this.logCron('sync-af-fixtures-top5', true, JSON.stringify(out).slice(0, 500), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`sync-af-fixtures-top5: ${msg}`);
      await this.logCron('sync-af-fixtures-top5', false, msg, undefined);
    }
  }

  /** 每天 03:30 — 欧冠赛程 */
  @Cron('30 3 * * *')
  async syncClMatches() {
    if (!this.enabled()) return;
    if (!(await this.quotaAllows(10))) return;
    const season = this.currentSeasonYear();
    try {
      const out = await this.apiFootballIngest.syncFixtures({
        competitionCodes: ['CL'],
        season,
        delayBetweenRequestsMs: 1400,
      });
      await this.logCron('sync-af-fixtures-CL', true, JSON.stringify(out).slice(0, 500), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`sync-af-fixtures-CL: ${msg}`);
      await this.logCron('sync-af-fixtures-CL', false, msg, undefined);
    }
  }

  /** 每天 04:00 — 积分榜 Redis 预热（AF 拉取写入缓存，C 端读 BFF） */
  @Cron('0 4 * * *')
  async syncStandings() {
    if (!this.enabled()) return;
    if (!(await this.quotaAllows(12))) return;
    const season = this.currentSeasonYear();
    const ttl = this.config.get<number>('cacheLeaguesStandingsTtlSec') ?? 1800;
    for (const code of ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'] as const) {
      try {
        const pack = await this.leaguesStandings.standingsForCode(code, season, 'api_football');
        await this.redis.setJson(`leagues:standings:${code}:${season}`, pack, ttl);
        await this.logCron(`sync-standings-${code}`, true, `rows=${pack.rows.length}`, 200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`standings ${code}: ${msg}`);
        await this.logCron(`sync-standings-${code}`, false, msg, undefined);
      }
    }
  }

  /** 约每 10 秒 — 仅 AF LIVE 场次高频刷新（默认关，ENABLE_MATCH_LIVE_FAST_POLL=true） */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollLiveMatchStatusHighFrequency() {
    if (!this.matchLiveFastPollEnabled()) return;
    if (this.liveStatusPollRunning) return;
    if (!(await this.quotaAllows(2))) return;
    this.liveStatusPollRunning = true;
    try {
      const out = await this.apiFootballIngest.pollLiveFixtureStatuses();
      if (out.attempted > 0) {
        this.log.debug(
          `live-match-poll AF ${out.succeeded}/${out.attempted} skip=${out.skipped}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`live-match-status-poll: ${msg}`);
    } finally {
      this.liveStatusPollRunning = false;
    }
  }

  /** 每 5 分钟 — 广域近窗 AF 比分/状态（ENABLE_MATCH_FD_LIVE_POLL=true 时启用，历史 env 名保留） */
  @Cron('*/5 * * * *')
  async pollAfRecentMatchStatus() {
    if (!this.afNearWindowPollEnabled()) return;
    if (!(await this.quotaAllows(5))) return;
    try {
      const out = await this.apiFootballIngest.pollRecentFixtureStatuses();
      await this.logCron(
        'near-window-match-status-poll',
        true,
        `AF attempted=${out.attempted} ok=${out.succeeded} fail=${out.failed} skip=${out.skipped}`,
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`near-window-match-status-poll: ${msg}`);
      await this.logCron('near-window-match-status-poll', false, msg, undefined);
    }
  }

  @Cron('*/10 * * * *')
  async scheduledPublicSourcesIngest() {
    if (!this.publicSourcesScheduleEnabled()) return;
    try {
      const { processed } = await this.publicSources.runScheduledIngestWindows(new Date());
      const okCount = processed.filter((p) => p.ok).length;
      await this.logCron(
        'public-sources-scheduled',
        true,
        `ticks=${processed.length} ok=${okCount}`,
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`public-sources-scheduled: ${msg}`);
      await this.logCron('public-sources-scheduled', false, msg, undefined);
    }
  }

  @Cron('*/20 * * * *')
  async autoIntelBatchTick() {
    if (!this.enabled()) return;
    try {
      const out = await this.autoIntel.runScheduledTick();
      if (!out) return;
      await this.logCron(
        'auto-intel-batch',
        out.failed.length === 0,
        `${out.mode} candidates=${out.candidates} ok=${out.succeeded} fail=${out.failed.length}`,
        out.failed.length ? 207 : 200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`auto-intel-batch: ${msg}`);
      await this.logCron('auto-intel-batch', false, msg, undefined);
    }
  }

  @Cron('0 */6 * * *')
  async syncAfPredictionsNearWindow() {
    if (!this.enabled()) return;
    try {
      const out = await this.autoIntel.runAfPredictionsNearWindowTick();
      if (!out) return;
      await this.logCron(
        'af-predictions-near-window',
        out.failed.length === 0,
        `candidates=${out.candidates} ok=${out.succeeded} fail=${out.failed.length}`,
        out.failed.length ? 207 : 200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`af-predictions-near-window: ${msg}`);
      await this.logCron('af-predictions-near-window', false, msg, undefined);
    }
  }

  @Cron('10,40 * * * *')
  async autoAiReportDraftTick() {
    if (!this.enabled()) return;
    try {
      const out = await this.autoAiReport.runScheduledTick();
      if (!out) return;
      await this.logCron(
        'auto-ai-report-batch',
        out.failed.length === 0,
        `candidates=${out.candidates} ok=${out.succeeded} fail=${out.failed.length} lookahead=${out.lookaheadHours}h`,
        out.failed.length ? 207 : 200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`auto-ai-report-batch: ${msg}`);
      await this.logCron('auto-ai-report-batch', false, msg, undefined);
    }
  }

  @Cron('5,15,25,35,45,55 * * * *')
  private afSyncCronEnabled() {
    return (
      this.enabled() && this.config.get<boolean>('enableAfSyncCron') === true
    );
  }

  /** B5：LIVE 场次赛中赔率序列（ENABLE_AF_ODDS_LIVE_SYNC） */
  @Cron('*/2 * * * *')
  async scheduledAfOddsLive() {
    if (!this.afSyncCronEnabled()) return;
    if (this.config.get<boolean>('enableAfOddsLiveSync') !== true) return;
    const intervalSec = this.config.get<number>('afOddsLiveIntervalSec') ?? 120;
    const minGapMs = Math.max(60, intervalSec) * 1000;
    const lockKey = 'cron:af-odds-live:last';
    const last = await this.redis.getString(lockKey);
    if (last && Date.now() - parseInt(last, 10) < minGapMs) return;
    if (!(await this.quotaAllows(3))) return;
    try {
      await this.oddsLiveSync.syncOddsMetaIfStale();
      const out = await this.oddsLiveSync.syncLiveOddsWindow();
      await this.redis.setString(lockKey, String(Date.now()), 3600);
      await this.logCron(
        'af-odds-live',
        true,
        `attempted=${out.attempted} ok=${out.ok}`,
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`af-odds-live: ${msg}`);
      await this.logCron('af-odds-live', false, msg, undefined);
    }
  }

  /** B4：低优先级档案同步（周更） */
  @Cron('30 3 * * 0')
  async scheduledAfCatalogLowPriority() {
    if (!this.afSyncCronEnabled()) return;
    if (!(await this.quotaAllows(5))) return;
    try {
      const out = await this.afCatalog.syncTransfersBatch({ maxTeams: 15 });
      await this.logCron(
        'af-catalog-low',
        true,
        JSON.stringify(out).slice(0, 500),
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`af-catalog-low: ${msg}`);
      await this.logCron('af-catalog-low', false, msg, undefined);
    }
  }

  /** v2：联赛 AF catalog（积分榜 + B2 端点） */
  @Cron('15 4 * * *')
  async scheduledLeagueAfCatalog() {
    if (!this.afSyncCronEnabled()) return;
    if (!(await this.quotaAllows(8))) return;
    const season = this.config.get<number>('afSyncSeason') ?? 2025;
    try {
      const rows = await this.prisma.competition.findMany({
        where: { externalId: { startsWith: 'af-l-' } },
        select: { code: true },
        take: 30,
      });
      let ok = 0;
      for (const row of rows) {
        if (!row.code) continue;
        try {
          await this.afSync.syncLeagueCatalog(row.code, season);
          ok++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.warn(`league-af-catalog ${row.code}: ${msg}`);
        }
      }
      await this.logCron(
        'league-af-catalog',
        true,
        `competitions=${rows.length} ok=${ok} season=${season}`,
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`league-af-catalog: ${msg}`);
      await this.logCron('league-af-catalog', false, msg, undefined);
    }
  }

  @Cron('25 */6 * * *')
  async scheduledAfRawBundlePreMatch() {
    if (!this.afSyncCronEnabled()) return;
    if (!(await this.quotaAllows(15))) return;
    try {
      const out = await this.afSync.syncPreMatchWindow({
        lookaheadHours: 240,
        maxMatches: 20,
      });
      await this.logCron(
        'af-raw-bundle-pre-match',
        out.failed === 0,
        `attempted=${out.attempted} ok=${out.ok} failed=${out.failed}`,
        out.failed ? 207 : 200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`af-raw-bundle-pre-match: ${msg}`);
    }
  }

  async scheduledAfPreMatchWindows() {
    if (!this.afPreMatchCronEnabled()) return;
    if (!(await this.quotaAllows(10))) return;
    try {
      const out = await this.apiFootballIngest.runScheduledPreMatchWindows();
      if (out.attempted > 0) {
        await this.logCron(
          'af-pre-match-windows',
          out.failed === 0,
          `attempted=${out.attempted} t24=${out.t24} t1=${out.t1} snap=${out.snapshotOk} odds=${out.oddsOk} wx=${out.weatherOk} fail=${out.failed}`,
          out.failed ? 207 : 200,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`af-pre-match-windows: ${msg}`);
      await this.logCron('af-pre-match-windows', false, msg, undefined);
    }
  }

  @Cron('15 */6 * * *')
  async scheduledAfMatchFactsEnrich() {
    if (!this.afMatchFactsCronEnabled()) return;
    if (!(await this.quotaAllows(20))) return;
    try {
      const out = await this.apiFootballIngest.runScheduledAfMatchFactsEnrich();
      await this.logCron(
        'af-match-facts-enrich',
        out.failed === 0,
        `attempted=${out.attempted} ok=${out.succeeded} skip=${out.skipped} fail=${out.failed}`,
        out.failed ? 207 : 200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`af-match-facts-enrich: ${msg}`);
      await this.logCron('af-match-facts-enrich', false, msg, undefined);
    }
  }

  /** 每 30 秒 tick；实际拉取间隔由 AF_LIVE_FACTS_INTERVAL_SEC（默认 90s）节流 */
  @Cron('*/30 * * * * *')
  async scheduledLiveFactsIngest() {
    if (!this.afLiveFactsCronEnabled()) return;
    if (!(await this.quotaAllows(8))) return;
    if (this.liveFactsIngestRunning) return;
    this.liveFactsIngestRunning = true;
    try {
      const out = await this.liveFactsIngest.runLiveFactsTick({
        minIntervalSec: this.config.get<number>('afLiveFactsIntervalSec') ?? 90,
      });
      if (out.attempted > 0) {
        await this.logCron(
          'live-facts-ingest',
          out.failed === 0,
          `attempted=${out.attempted} ok=${out.succeeded} fail=${out.failed} pub=${out.published.length}`,
          out.failed ? 207 : 200,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`live-facts-ingest: ${msg}`);
      await this.logCron('live-facts-ingest', false, msg, undefined);
    } finally {
      this.liveFactsIngestRunning = false;
    }
  }

  /** 每 60 秒 tick；球员统计默认 120s 间隔 */
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledLivePlayersIngest() {
    if (!this.afLivePlayersCronEnabled()) return;
    if (!(await this.quotaAllows(6))) return;
    if (this.livePlayersIngestRunning) return;
    this.livePlayersIngestRunning = true;
    try {
      const out = await this.liveFactsIngest.runLivePlayersTick({
        minIntervalSec: this.config.get<number>('afLivePlayersIntervalSec') ?? 120,
      });
      if (out.attempted > 0) {
        await this.logCron(
          'live-players-ingest',
          out.failed === 0,
          `attempted=${out.attempted} ok=${out.succeeded} fail=${out.failed}`,
          out.failed ? 207 : 200,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`live-players-ingest: ${msg}`);
      await this.logCron('live-players-ingest', false, msg, undefined);
    } finally {
      this.livePlayersIngestRunning = false;
    }
  }

  /** 每 10 分钟刷新 LIVE 涉及联赛的积分榜物化 */
  @Cron('*/10 * * * *')
  async scheduledLiveStandingsTick() {
    if (!this.liveStandingsTickEnabled()) return;
    if (!(await this.quotaAllows(8))) return;
    try {
      const out = await this.liveStandingsTick.runTick({
        minIntervalSec: this.config.get<number>('liveStandingsTickIntervalSec') ?? 600,
      });
      if (out.leagues.length > 0) {
        await this.logCron(
          'live-standings-tick',
          true,
          `leagues=${out.leagues.join(',')}`,
          200,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`live-standings-tick: ${msg}`);
      await this.logCron('live-standings-tick', false, msg, undefined);
    }
  }

  @Cron('*/2 * * * *')
  async scheduledPredictionLock() {
    if (!this.predictionLockCronEnabled()) return;
    try {
      const max = this.config.get<number>('predictionLockMaxPerTick') ?? 40;
      const out = await this.prediction.lockDuePredictions(max);
      if (out.locked > 0) {
        await this.logCron(
          'prediction-lock',
          true,
          `attempted=${out.attempted} locked=${out.locked}`,
          200,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`prediction-lock: ${msg}`);
      await this.logCron('prediction-lock', false, msg, undefined);
    }
  }

  @Cron('25,55 * * * *')
  async scheduledPostMatchReports() {
    if (!this.postMatchReportCronEnabled()) return;
    try {
      const out = await this.autoPostMatchReport.runScheduledTick();
      if (out.attempted > 0) {
        await this.logCron(
          'post-match-reports',
          out.errors.length === 0,
          `attempted=${out.attempted} post=${out.postMatchCreated} live=${out.liveNarrativeCreated} review=${out.submittedReview}`,
          out.errors.length ? 207 : 200,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`post-match-reports: ${msg}`);
      await this.logCron('post-match-reports', false, msg, undefined);
    }
  }

  @Cron('0 5 * * *')
  async scheduledPredictionGrading() {
    if (!this.predictionGradingCronEnabled()) return;
    try {
      const max = this.config.get<number>('predictionGradingMaxPerTick') ?? 100;
      const lookback = this.config.get<number>('predictionGradingLookbackDays') ?? 30;
      const out = await this.predictionGrading.gradeFinishedBatch({
        maxMatches: max,
        lookbackDays: lookback,
      });
      await this.logCron(
        'prediction-grading',
        (out.result.errors?.length ?? 0) === 0,
        `attempted=${out.result.attempted} graded=${out.result.graded} skip=${out.result.skipped}`,
        out.result.errors?.length ? 207 : 200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`prediction-grading: ${msg}`);
      await this.logCron('prediction-grading', false, msg, undefined);
    }
  }

  @Cron('15 */2 * * *')
  async wcPreMatchT48() {
    if (!this.worldCupCron.enabled()) return;
    try {
      const out = await this.worldCupCron.runPreMatchT48();
      await this.logCron('wc-pre-match-t48', true, JSON.stringify(out).slice(0, 200), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logCron('wc-pre-match-t48', false, msg, undefined);
    }
  }

  @Cron('5 */1 * * *')
  async wcPreMatchT24() {
    if (!this.worldCupCron.enabled()) return;
    try {
      const out = await this.worldCupCron.runPreMatchT24();
      await this.logCron('wc-pre-match-t24', true, JSON.stringify(out).slice(0, 200), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logCron('wc-pre-match-t24', false, msg, undefined);
    }
  }

  @Cron('*/15 * * * *')
  async wcPreMatchT1() {
    if (!this.worldCupCron.enabled()) return;
    try {
      const out = await this.worldCupCron.runPreMatchT1();
      await this.logCron('wc-pre-match-t1', true, JSON.stringify(out).slice(0, 200), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logCron('wc-pre-match-t1', false, msg, undefined);
    }
  }

  @Cron('*/3 * * * *')
  async wcLiveTick() {
    if (!this.worldCupCron.enabled()) return;
    try {
      const out = await this.worldCupCron.runLiveTick();
      await this.logCron('wc-live-tick', true, JSON.stringify(out).slice(0, 200), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logCron('wc-live-tick', false, msg, undefined);
    }
  }

  @Cron('40 5 * * *')
  async wcPostMatch() {
    if (!this.worldCupCron.enabled()) return;
    try {
      const out = await this.worldCupCron.runPostMatch();
      await this.logCron('wc-post-match', true, JSON.stringify(out).slice(0, 200), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logCron('wc-post-match', false, msg, undefined);
    }
  }

  @Cron('30 4 * * *')
  async syncFeaturedWeather() {
    if (!this.enabled()) return;
    const matches = await this.prisma.match.findMany({
      where: { isFeatured: true },
      take: 15,
      select: { id: true },
    });
    for (const m of matches) {
      try {
        await this.weather.syncForMatch(m.id);
        await this.logCron(`weather-${m.id}`, true, 'ok', 200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.logCron(`weather-${m.id}`, false, msg, undefined);
      }
    }
  }
}
