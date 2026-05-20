import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';
import {
  CORE_FIXTURE_CODES,
  INGEST_BUNDLES,
  IngestBundleId,
  isIngestBundleId,
} from './ingest-bundle.definitions';
import { IngestJobTrackerService } from './ingest-job-tracker.service';
import { StandingsMaterializeService } from './standings-materialize.service';
import { TopscorersMaterializeService } from './topscorers-materialize.service';
import { MatchStatusReconcileService } from './match-status-reconcile.service';
import { InjuriesMaterializeService } from './injuries-materialize.service';
import {
  FinishedPostMatchBootstrapService,
  type FinishedBootstrapParams,
} from './finished-post-match-bootstrap.service';
import {
  ScheduledPreMatchBootstrapService,
  type ScheduledBootstrapParams,
} from './scheduled-pre-match-bootstrap.service';
import { MatchLiveFactsIngestService } from '../match-live/match-live-facts-ingest.service';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { WorldCupBootstrapService } from '../world-cup/world-cup-bootstrap.service';
import { ConfigService } from '@nestjs/config';
import { LocalizationBackfillService } from '../localization/localization-backfill.service';

export type RunBundleParams = {
  season?: number;
  wcSeason?: number;
  delayBetweenMs?: number;
  maxPages?: number;
  maxTeams?: number;
  lookbackDays?: number;
  lookaheadDays?: number;
  batchSize?: number;
  maxRounds?: number;
  delayBetweenMatchesMs?: number;
  dryRun?: boolean;
  skipAiReport?: boolean;
  maxParallel?: number;
  generateAiDrafts?: boolean;
  resumeFromStep?: string;
};

@Injectable()
export class IngestOrchestratorService {
  private readonly log = new Logger(IngestOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracker: IngestJobTrackerService,
    private readonly afIngest: ApiFootballIngestService,
    private readonly afQuota: ApiFootballQuotaService,
    private readonly standings: StandingsMaterializeService,
    private readonly topscorers: TopscorersMaterializeService,
    private readonly reconcile: MatchStatusReconcileService,
    private readonly injuries: InjuriesMaterializeService,
    private readonly finishedBootstrap: FinishedPostMatchBootstrapService,
    private readonly scheduledBootstrap: ScheduledPreMatchBootstrapService,
    private readonly liveFactsIngest: MatchLiveFactsIngestService,
    private readonly afSync: AfSyncOrchestrator,
    @Inject(forwardRef(() => WorldCupBootstrapService))
    private readonly worldCupBootstrap: WorldCupBootstrapService,
    private readonly config: ConfigService,
    private readonly l10nBackfill: LocalizationBackfillService,
  ) {}

  runWorldCupAfFullBootstrap(params: RunBundleParams = {}) {
    return this.worldCupBootstrap.startBootstrap({
      season: params.wcSeason ?? params.season,
      maxParallel: params.maxParallel,
      dryRun: params.dryRun,
      generateAiDrafts: params.generateAiDrafts,
      resumeFromStep: params.resumeFromStep,
    });
  }

  listBundles() {
    return Object.values(INGEST_BUNDLES).map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      steps: b.steps,
    }));
  }

  async runBundle(bundleId: string, params: RunBundleParams = {}) {
    if (!isIngestBundleId(bundleId)) {
      throw new BadRequestException(`Unknown bundle: ${bundleId}`);
    }
    if (bundleId === 'worldcup_af_full_bootstrap') {
      return this.worldCupBootstrap.startBootstrap({
        season: params.wcSeason ?? params.season,
        maxParallel: params.maxParallel,
        dryRun: params.dryRun,
        generateAiDrafts: params.generateAiDrafts,
        resumeFromStep: params.resumeFromStep,
      });
    }
    const running = await this.tracker.findRunningBundleJob(bundleId);
    if (running) {
      return { jobId: running.id, status: running.status, deduplicated: true };
    }
    const job = await this.tracker.start({
      kind: `bundle:${bundleId}`,
      bundleId,
      params: params as Record<string, unknown>,
      stepLabel: '排队中',
    });

    if (bundleId === 'finished_post_match_bootstrap') {
      const bootstrapParams: FinishedBootstrapParams = {
        lookbackDays: params.lookbackDays,
        batchSize: params.batchSize,
        maxRounds: params.maxRounds,
        delayBetweenMatchesMs: params.delayBetweenMatchesMs,
        dryRun: params.dryRun,
      };
      void this.finishedBootstrap
        .run(job.id, bootstrapParams)
        .then((summary) => this.tracker.finish(job.id, true, summary))
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.error(`finished bootstrap ${job.id}: ${msg}`);
          return this.tracker.finish(job.id, false, {}, msg);
        });
      return { jobId: job.id, status: 'RUNNING' };
    }

    if (bundleId === 'scheduled_pre_match_bootstrap') {
      const bootstrapParams: ScheduledBootstrapParams = {
        lookaheadDays: params.lookaheadDays,
        batchSize: params.batchSize,
        maxRounds: params.maxRounds,
        delayBetweenMatchesMs: params.delayBetweenMatchesMs,
        dryRun: params.dryRun,
        skipAiReport: params.skipAiReport,
      };
      void this.scheduledBootstrap
        .run(job.id, bootstrapParams)
        .then((summary) => this.tracker.finish(job.id, true, summary))
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.error(`scheduled bootstrap ${job.id}: ${msg}`);
          return this.tracker.finish(job.id, false, {}, msg);
        });
      return { jobId: job.id, status: 'RUNNING' };
    }

    const season = params.season ?? 2025;
    const wcSeason = params.wcSeason ?? 2026;
    try {
      const summary = await this.executeBundle(
        bundleId,
        job.id,
        season,
        wcSeason,
        params,
      );
      await this.tracker.finish(job.id, true, summary);
      return { jobId: job.id, status: 'SUCCEEDED', summary };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.tracker.finish(job.id, false, {}, msg);
      return { jobId: job.id, status: 'FAILED', error: msg };
    }
  }

  private async executeBundle(
    bundleId: IngestBundleId,
    jobId: string,
    season: number,
    wcSeason: number,
    params: RunBundleParams,
  ): Promise<Record<string, unknown>> {
    const def = INGEST_BUNDLES[bundleId];
    const summary: Record<string, unknown> = { bundleId, season, wcSeason };
    const total = def.steps.length;
    let idx = 0;

    const step = async (stepId: string, fn: () => Promise<unknown>) => {
      await this.tracker.progress(
        jobId,
        total ? Math.round((idx / total) * 100) : 0,
        stepId,
      );
      summary[stepId] = await fn();
      idx++;
    };

    const runFixturesCore = () =>
      this.afIngest.syncFixtures({
        competitionCodes: CORE_FIXTURE_CODES.filter((c) => c !== 'WC'),
        season,
        delayBetweenRequestsMs: params.delayBetweenMs ?? 1350,
        maxPagesPerLeague: params.maxPages ?? 40,
      });

    const runFixturesWc = () =>
      this.afIngest.syncFixtures({
        competitionCodes: ['WC'],
        season: wcSeason,
        delayBetweenRequestsMs: params.delayBetweenMs ?? 1350,
        maxPagesPerLeague: params.maxPages ?? 40,
      });

    const runSquads = () =>
      this.afIngest.syncSquads({
        competitionCodes: CORE_FIXTURE_CODES.filter((c) => c !== 'WC'),
        season,
        delayBetweenRequestsMs: params.delayBetweenMs ?? 2200,
        maxTeamsPerLeague: params.maxTeams ?? 24,
      });

    for (const s of def.steps) {
      switch (s.id) {
        case 'verify':
          await step('verify', () => this.verifyCatalog());
          break;
        case 'fixtures':
          await step('fixtures', runFixturesCore);
          break;
        case 'fixtures_wc':
          await step('fixtures_wc', runFixturesWc);
          break;
        case 'squads':
          await step('squads', runSquads);
          if (this.config.get<boolean>('enableIngestLocalizationBackfill') === true) {
            await step('localization_backfill', () =>
              this.l10nBackfill.run({
                entityTypes: ['team', 'player', 'competition'],
                competitionCodes: CORE_FIXTURE_CODES,
              }),
            );
          }
          break;
        case 'standings':
          await step('standings', () => this.standings.syncAll(season, wcSeason));
          break;
        case 'topscorers':
          await step('topscorers', () => this.topscorers.syncAll(season, wcSeason));
          break;
        case 'facts':
          await step('facts', () =>
            this.afIngest.runScheduledAfMatchFactsEnrich({ maxMatches: 80 }),
          );
          break;
        case 'poll':
          await step('poll', () => this.reconcile.pollRecent());
          break;
        case 'reconcile':
          await step('reconcile', () => this.reconcile.reconcileStaleLive());
          break;
        case 'injuries':
          await step('injuries', () => this.injuries.syncUpcomingWindow());
          break;
        case 'af_raw_full':
          await step('af_raw_full', () =>
            this.afSync.syncPreMatchWindow({
              lookaheadHours: params.lookaheadDays != null ? params.lookaheadDays * 24 : 240,
              maxMatches: params.batchSize ?? 25,
            }),
          );
          break;
        case 'live_facts':
          await step('live_facts', () =>
            this.liveFactsIngest.runLiveFactsTick({ minIntervalSec: 0 }),
          );
          break;
        case 'live_players':
          await step('live_players', () =>
            this.liveFactsIngest.runLivePlayersTick({ minIntervalSec: 0 }),
          );
          break;
        default:
          this.log.warn(`Unknown step id ${s.id}`);
      }
    }

    summary.quota = await this.afQuota.snapshot();
    return summary;
  }

  private async verifyCatalog() {
    const [tournaments, competitions, seasons] = await Promise.all([
      this.prisma.tournament.count({ where: { isActive: true } }),
      this.prisma.competition.count(),
      this.prisma.season.count(),
    ]);
    if (competitions < 5) {
      throw new BadRequestException(
        'Competition 不足，请先 npm run prisma:seed',
      );
    }
    return { tournaments, competitions, seasons };
  }

  async getJob(id: string, opts?: { itemsTake?: number; itemsSkip?: number }) {
    const job = await this.prisma.ingestJobRun.findUnique({ where: { id } });
    if (!job) return null;
    const take = Math.min(500, opts?.itemsTake ?? 100);
    const skip = opts?.itemsSkip ?? 0;
    const [items, itemsTotal] = await Promise.all([
      this.prisma.ingestJobItem.findMany({
        where: { jobId: id },
        orderBy: { startedAt: 'asc' },
        take,
        skip,
      }),
      this.prisma.ingestJobItem.count({ where: { jobId: id } }),
    ]);
    return { ...job, items, itemsTotal };
  }

  async listJobs(take = 30) {
    return this.prisma.ingestJobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
    });
  }

  async cancelJob(jobId: string) {
    return this.tracker.cancelJob(jobId);
  }

  /** 仅对 FAILED 的 job items 重跑单场 sync-full */
  async retryFailedItems(jobId: string) {
    const job = await this.prisma.ingestJobRun.findUnique({ where: { id: jobId } });
    if (!job) throw new BadRequestException('Job not found');
    const items = await this.prisma.ingestJobItem.findMany({
      where: { jobId, status: 'FAILED', matchId: { not: null } },
    });
    let ok = 0;
    let failed = 0;
    for (const item of items) {
      if (!item.matchId) continue;
      try {
        await this.afSync.syncSingleMatchFull(item.matchId, { force: true, delayMs: 400 });
        await this.tracker.finishItem(item.id, 'SUCCESS');
        ok++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.tracker.finishItem(item.id, 'FAILED', { errorMessage: msg });
        failed++;
      }
    }
    return { jobId, attempted: items.length, ok, failed };
  }
}
