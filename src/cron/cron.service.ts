import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FootballDataService } from '../football-data/football-data.service';
import { PublicSourcesService } from '../public-sources/public-sources.service';
import { WeatherService } from '../weather/weather.service';
import { AutoAiReportBatchService } from '../ai-report/auto-ai-report-batch.service';
import { AutoPostMatchReportBatchService } from '../ai-report/auto-post-match-report-batch.service';
import { AutoIntelBatchService } from '../auto-intel/auto-intel-batch.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { PredictionGradingService } from '../prediction/prediction-grading.service';
import { PredictionService } from '../prediction/prediction.service';
import { MatchLiveFactsIngestService } from '../match-live/match-live-facts-ingest.service';

@Injectable()
export class CronService {
  private readonly log = new Logger(CronService.name);
  /** 防止赛中高频 tick 与自身重叠（单轮拉取较慢时）。 */
  private liveStatusPollRunning = false;
  private liveFactsIngestRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly footballData: FootballDataService,
    private readonly weather: WeatherService,
    private readonly publicSources: PublicSourcesService,
    private readonly autoIntel: AutoIntelBatchService,
    private readonly autoAiReport: AutoAiReportBatchService,
    private readonly apiFootballIngest: ApiFootballIngestService,
    private readonly prediction: PredictionService,
    private readonly predictionGrading: PredictionGradingService,
    private readonly liveFactsIngest: MatchLiveFactsIngestService,
    private readonly autoPostMatchReport: AutoPostMatchReportBatchService,
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

  /** 赛中约每 10 秒拉上游（需 ENABLE_CRON_SYNC + 近窗轮询 + ENABLE_MATCH_LIVE_FAST_POLL）。 */
  private matchLiveFastPollEnabled() {
    return (
      this.enabled() &&
      this.config.get<boolean>('enableMatchFdLivePoll') === true &&
      this.config.get<boolean>('enableMatchLiveFastPoll') === true
    );
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

  /** 每天 03:00 — 五大联赛赛程（有 API Key 时尝试） */
  @Cron('0 3 * * *')
  async syncTopFiveMatches() {
    if (!this.enabled()) return;
    for (const code of ['PL', 'PD', 'SA', 'BL1', 'FL1'] as const) {
      try {
        await this.footballData.syncMatchesByCode(code);
        await this.logCron(`sync-matches-${code}`, true, 'ok', 200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`${code}: ${msg}`);
        await this.logCron(`sync-matches-${code}`, false, msg, undefined);
      }
    }
  }

  /** 每天 03:30 — 欧冠 */
  @Cron('30 3 * * *')
  async syncClMatches() {
    if (!this.enabled()) return;
    try {
      await this.footballData.syncMatchesByCode('CL');
      await this.logCron('sync-matches-CL', true, 'ok', 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`CL: ${msg}`);
      await this.logCron('sync-matches-CL', false, msg, undefined);
    }
  }

  /** 每天 04:00 — 积分榜（五大 + 欧冠；单场失败不影响其他联赛） */
  @Cron('0 4 * * *')
  async syncStandings() {
    if (!this.enabled()) return;
    for (const code of ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'] as const) {
      try {
        await this.footballData.syncStandings(code);
        await this.logCron(`sync-standings-${code}`, true, 'ok', 200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`standings ${code}: ${msg}`);
        await this.logCron(`sync-standings-${code}`, false, msg, undefined);
      }
    }
  }

  /**
   * 约每 10 秒 — 仅「LIVE + 已开球仍 SCHEDULED」场次拉 FD / API-Football，保证赛中数据十秒级刷新（不落 ApiLog；上一轮未完成则跳过）。
   * 真正「亚秒」需上游 WebSocket/推送；此处为轮询上界 + 上游响应时间。
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollLiveMatchStatusHighFrequency() {
    if (!this.matchLiveFastPollEnabled()) return;
    if (this.liveStatusPollRunning) return;
    this.liveStatusPollRunning = true;
    try {
      const out = await this.footballData.pollLiveMatchStatusNearWindow();
      const n = out.footballData.attempted + out.apiFootball.attempted;
      if (n > 0) {
        this.log.debug(
          `live-match-poll FD ${out.footballData.succeeded}/${out.footballData.attempted} AF ${out.apiFootball.succeeded}/${out.apiFootball.attempted}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`live-match-status-poll: ${msg}`);
    } finally {
      this.liveStatusPollRunning = false;
    }
  }

  /**
   * 每 5 分钟 — 广域近窗（开球前后大窗口），与上项高频任务互补；覆盖即将开赛等低频场景。
   * 需 ENABLE_CRON_SYNC=true，且未设置 ENABLE_MATCH_FD_LIVE_POLL=false。
   */
  @Cron('*/5 * * * *')
  async pollFdRecentMatchStatus() {
    if (!this.enabled()) return;
    if (this.config.get<boolean>('enableMatchFdLivePoll') !== true) return;
    try {
      const out = await this.footballData.pollRecentMatchStatusNearWindow();
      await this.logCron(
        'near-window-match-status-poll',
        true,
        `FD attempted=${out.footballData.attempted} ok=${out.footballData.succeeded} fail=${out.footballData.failed}; AF attempted=${out.apiFootball.attempted} ok=${out.apiFootball.succeeded} fail=${out.apiFootball.failed}`,
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`near-window-match-status-poll: ${msg}`);
      await this.logCron('near-window-match-status-poll', false, msg, undefined);
    }
  }

  /**
   * 每 10 分钟 — 公开来源分阶段抓取（需 ENABLE_CRON_SYNC + ENABLE_PUBLIC_SOURCE_FETCH）。
   * 开球前约 48h / 8h / 2h 各一次；完场后若行在约 45 分钟内更新且尚未 post 阶段则补一次。
   */
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

  /**
   * 每 20 分钟 — 自动预测 / 情报管线（需 ENABLE_CRON_SYNC + AUTO_INTEL_CRON_MODE=prediction|full）。
   * 对「未来 lookahead 小时内、尚无 MatchPrediction」的 SCHEDULED/LIVE 场次批量处理，避免逐场点 Admin。
   */
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

  /**
   * 每 30 分钟（:10 与 :40）— 赛前 AI 报告草稿（需 ENABLE_CRON_SYNC + AUTO_AI_REPORT_CRON）。
   * 与 auto-intel 错开分钟，减轻同一时刻外部请求峰值。
   */
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

  /**
   * 每 10 分钟（:05）— T-24h/T-1h 赛前球队/球员快照 + 赔率（需 ENABLE_AF_PRE_MATCH_CRON=true）。
   */
  @Cron('5,15,25,35,45,55 * * * *')
  async scheduledAfPreMatchWindows() {
    if (!this.afPreMatchCronEnabled()) return;
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

  /**
   * 每 6 小时（:15）— 近窗 FINISHED 的 `af-f-*` 写满 MatchFacts（需 ENABLE_AF_MATCH_FACTS_CRON=true）。
   */
  @Cron('15 */6 * * *')
  async scheduledAfMatchFactsEnrich() {
    if (!this.afMatchFactsCronEnabled()) return;
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

  /**
   * 每 30 秒 — LIVE 场次增量 events/statistics（AF + FD；需 ENABLE_AF_LIVE_FACTS_CRON，默认开）。
   */
  @Cron('*/30 * * * * *')
  async scheduledLiveFactsIngest() {
    if (!this.afLiveFactsCronEnabled()) return;
    if (this.liveFactsIngestRunning) return;
    this.liveFactsIngestRunning = true;
    try {
      const out = await this.liveFactsIngest.runLiveFactsTick({
        minIntervalSec: this.config.get<number>('afLiveFactsIntervalSec') ?? 30,
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

  /** 每 2 分钟 — 开球前 5 分钟锁定 active 预测（需 ENABLE_PREDICTION_LOCK_CRON，默认随 CRON 开启） */
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

  /** 每 45 分钟 — FINISHED 场次生成赛后复盘 + 可选文字直播叙事（需 ENABLE_POST_MATCH_REPORT_CRON） */
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

  /** 每天 05:00 — FINISHED 且未对账的冻结预测补跑 grading */
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

  /** 每天 04:30 — 焦点战天气 */
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
