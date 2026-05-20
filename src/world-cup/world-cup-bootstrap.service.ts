import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSourceType, Prisma } from '@prisma/client';
import { AiReportService } from '../ai-report/ai-report.service';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import { IngestJobTrackerService } from '../data-pipeline/ingest-job-tracker.service';
import { StandingsMaterializeService } from '../data-pipeline/standings-materialize.service';
import { TopscorersMaterializeService } from '../data-pipeline/topscorers-materialize.service';
import { MatchIntelFreshnessService } from '../match-intel/match-intel-freshness.service';
import { PredictionService } from '../prediction/prediction.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { WorldCupCoverageService } from './world-cup-coverage.service';
import { LocalizationSeedService } from '../localization/localization-seed.service';
import { LocalizationBackfillService } from '../localization/localization-backfill.service';
import { AfTeamOverrideImportService } from '../localization/af-team-override-import.service';
import { LocalizationService } from '../localization/localization.service';
import {
  WORLD_CUP_COMPETITION_CODE,
  WORLD_CUP_DEFAULT_SEASON,
  WORLD_CUP_TOURNAMENT_CODE,
} from './world-cup-match.util';

export type WorldCupBootstrapParams = {
  season?: number;
  maxParallel?: number;
  dryRun?: boolean;
  skipExisting?: boolean;
  generateAiDrafts?: boolean;
  resumeFromStep?: string;
};

const STEPS = [
  'catalog_verify',
  'fixtures_wc',
  'teams_af',
  'squads_wc',
  'standings_wc',
  'leaderboards_wc',
  'team_profiles_wc',
  'zh_seed_apply',
  'localization_backfill_wc',
  'zh_coverage_report',
  'matches_sync_full',
  'matches_pre_match_snapshot',
  'matches_prediction_af',
  'matches_weather_t24',
  'matches_ai_draft',
  'coverage_report',
] as const;

@Injectable()
export class WorldCupBootstrapService {
  private readonly log = new Logger(WorldCupBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tracker: IngestJobTrackerService,
    private readonly afIngest: ApiFootballIngestService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly preMatchSnapshots: MatchAfPreMatchSnapshotService,
    private readonly prediction: PredictionService,
    private readonly weather: WeatherService,
    private readonly aiReport: AiReportService,
    private readonly standings: StandingsMaterializeService,
    private readonly topscorers: TopscorersMaterializeService,
    private readonly freshness: MatchIntelFreshnessService,
    private readonly coverage: WorldCupCoverageService,
    private readonly l10nSeed: LocalizationSeedService,
    private readonly l10nBackfill: LocalizationBackfillService,
    private readonly overrideImport: AfTeamOverrideImportService,
    private readonly l10n: LocalizationService,
  ) {}

  async startBootstrap(params: WorldCupBootstrapParams = {}): Promise<{
    jobId: string;
    status: string;
    deduplicated?: boolean;
  }> {
    const running = await this.prisma.ingestJobRun.findFirst({
      where: { kind: 'worldcup_af_full_bootstrap', status: 'RUNNING' },
      orderBy: { startedAt: 'desc' },
    });
    if (running) {
      return { jobId: running.id, status: running.status, deduplicated: true };
    }

    const job = await this.tracker.start({
      kind: 'worldcup_af_full_bootstrap',
      bundleId: 'worldcup_af_full_bootstrap',
      params: params as Record<string, unknown>,
      stepLabel: 'queued',
    });

    void this.run(job.id, params).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`worldcup bootstrap ${job.id}: ${msg}`);
      return this.tracker.finish(job.id, false, {}, msg);
    });

    return { jobId: job.id, status: 'RUNNING' };
  }

  async run(jobId: string, params: WorldCupBootstrapParams): Promise<Record<string, unknown>> {
    const season = params.season ?? WORLD_CUP_DEFAULT_SEASON;
    const maxParallel = Math.min(8, Math.max(1, params.maxParallel ?? 3));
    const delayMs = 400;
    const summary: Record<string, unknown> = { season };
    const startIdx = params.resumeFromStep ?
      Math.max(0, STEPS.indexOf(params.resumeFromStep as (typeof STEPS)[number]))
    : 0;

    const step = async (id: string, fn: () => Promise<unknown>) => {
      const idx = STEPS.indexOf(id as (typeof STEPS)[number]);
      if (idx < startIdx) return;
      await this.tracker.progress(
        jobId,
        Math.round(((idx + 1) / STEPS.length) * 100),
        id,
      );
      if (params.dryRun) {
        summary[id] = { dryRun: true };
        return;
      }
      summary[id] = await fn();
    };

    await step('catalog_verify', () => this.catalogVerify());
    await step('fixtures_wc', async () => {
      const fx = await this.afIngest.syncFixtures({
        competitionCodes: [WORLD_CUP_COMPETITION_CODE],
        season,
        delayBetweenRequestsMs: 1500,
      });
      const teamCheck = await this.validateWcFixtureTeams(jobId);
      return { ...((fx as object) ?? {}), teamCheck };
    });
    await step('teams_af', () =>
      this.afIngest.syncTeamsAfForLeague({ season, delayMs: 800 }),
    );
    await step('squads_wc', () =>
      this.afIngest.syncSquads({
        competitionCodes: [WORLD_CUP_COMPETITION_CODE],
        season,
        delayBetweenRequestsMs: 1200,
        maxTeamsPerLeague: 56,
      }),
    );
    await step('standings_wc', () => this.standings.syncCode(WORLD_CUP_COMPETITION_CODE, season));
    await step('leaderboards_wc', () =>
      this.topscorers.syncWcLeaderboardsFull(WORLD_CUP_COMPETITION_CODE, season),
    );
    await step('team_profiles_wc', () =>
      this.afIngest.syncWc2026TeamProfilesFromApiFootball({
        season,
        delayMs: 1200,
        maxTeams: 56,
      }),
    );
    await step('zh_seed_apply', async () => {
      const override = await this.overrideImport.importAll();
      const stats = await this.l10nSeed.applyFromDirectory();
      return { override, stats };
    });
    await step('localization_backfill_wc', () =>
      this.l10nBackfill.run({
        entityTypes: ['team', 'player', 'competition'],
        competitionCodes: [WORLD_CUP_COMPETITION_CODE],
        onlyMissing: true,
      }),
    );
    await step('zh_coverage_report', () =>
      this.coverage.getZhCoverageReport(WORLD_CUP_COMPETITION_CODE),
    );

    const wcMatchIds = await this.listWcMatchIds();
    summary.wcMatchCount = wcMatchIds.length;

    await step('matches_sync_full', () =>
      this.batchSyncFull(wcMatchIds, jobId, maxParallel, delayMs),
    );
    await step('matches_pre_match_snapshot', () =>
      this.batchSnapshots(wcMatchIds, jobId, maxParallel, delayMs),
    );
    await step('matches_prediction_af', () =>
      this.batchPredictions(wcMatchIds, jobId, maxParallel),
    );
    await step('matches_weather_t24', () => this.batchWeather(wcMatchIds, jobId));
    if (params.generateAiDrafts === true) {
      await step('matches_ai_draft', () => this.batchAiDrafts(wcMatchIds, jobId));
    } else {
      summary.matches_ai_draft = { skipped: true, reason: 'generateAiDrafts=false' };
    }
    await step('coverage_report', () => this.coverageReport(wcMatchIds));

    await this.tracker.finish(jobId, true, summary);
    return summary;
  }

  private async validateWcFixtureTeams(jobId: string) {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    if (!comp) return { failed: 0, ok: 0 };
    const matches = await this.prisma.match.findMany({
      where: { competitionId: comp.id, externalId: { startsWith: 'af-f-' } },
      select: {
        id: true,
        externalId: true,
        homeTeam: { select: { externalId: true } },
        awayTeam: { select: { externalId: true } },
      },
    });
    let failed = 0;
    let ok = 0;
    for (const m of matches) {
      const homeOk = m.homeTeam.externalId?.startsWith('af-t-');
      const awayOk = m.awayTeam.externalId?.startsWith('af-t-');
      if (homeOk && awayOk) {
        ok += 1;
        continue;
      }
      const item = await this.tracker.startItem({
        jobId,
        matchId: m.id,
        currentStep: 'fixtures_wc_team_check',
      });
      const msg = `home=${m.homeTeam.externalId ?? 'null'} away=${m.awayTeam.externalId ?? 'null'}`;
      await this.tracker.finishItem(item.id, 'FAILED', {
        errorCode: 'TEAM_NOT_AF',
        errorMessage: msg,
      });
      failed += 1;
    }
    return { failed, ok, total: matches.length };
  }

  private async catalogVerify(): Promise<Record<string, unknown>> {
    const tour = await this.prisma.tournament.findUnique({
      where: { code: WORLD_CUP_TOURNAMENT_CODE },
    });
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
    });
    if (!tour || !comp) {
      throw new BadRequestException('FIFA_WC / WC catalog missing; run seed first');
    }
    return { tournamentId: tour.id, competitionId: comp.id, ok: true };
  }

  private async listWcMatchIds(): Promise<string[]> {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    if (!comp) return [];
    const rows = await this.prisma.match.findMany({
      where: {
        competitionId: comp.id,
        externalId: { startsWith: 'af-f-' },
      },
      select: { id: true },
      orderBy: { kickoffTime: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  private async batchSyncFull(
    matchIds: string[],
    jobId: string,
    maxParallel: number,
    delayMs: number,
  ) {
    return this.runPool(matchIds, jobId, maxParallel, 'matches_sync_full', async (matchId) => {
      await this.afSync.syncSingleMatchFull(matchId, { delayMs });
      await this.freshness.refreshIntelContentHash(matchId);
    });
  }

  private async batchSnapshots(
    matchIds: string[],
    jobId: string,
    maxParallel: number,
    delayMs: number,
  ) {
    return this.runPool(matchIds, jobId, maxParallel, 'snapshot', async (matchId) => {
      await this.preMatchSnapshots.syncByMatchId(matchId, { delayMs, phase: 'T24' });
      await this.freshness.refreshIntelContentHash(matchId);
    });
  }

  private async batchPredictions(
    matchIds: string[],
    jobId: string,
    maxParallel: number,
  ) {
    return this.runPool(matchIds, jobId, maxParallel, 'prediction', async (matchId) => {
      await this.prediction.generateForMatch(matchId, { provider: 'af' });
      await this.freshness.refreshIntelContentHash(matchId);
    });
  }

  private async batchWeather(matchIds: string[], jobId: string) {
    const now = Date.now();
    const t24 = 24 * 3600_000;
    let ok = 0;
    let skipped = 0;
    for (const matchId of matchIds) {
      const m = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: { kickoffTime: true, city: true },
      });
      if (!m?.city?.trim() || m.kickoffTime.getTime() - now > t24 || m.kickoffTime.getTime() < now) {
        skipped += 1;
        continue;
      }
      const item = await this.tracker.startItem({
        jobId,
        matchId,
        currentStep: 'weather',
      });
      try {
        await this.weather.syncForMatch(matchId);
        await this.freshness.refreshIntelContentHash(matchId);
        await this.tracker.finishItem(item.id, 'SUCCESS');
        ok += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.tracker.finishItem(item.id, 'FAILED', { errorMessage: msg });
      }
    }
    return { ok, skipped, total: matchIds.length };
  }

  private async batchAiDrafts(matchIds: string[], jobId: string) {
    let ok = 0;
    let skipped = 0;
    for (const matchId of matchIds) {
      const gen = await this.coverage.evaluateGenerateGate(matchId);
      if (!gen.aiGeneratable) {
        skipped += 1;
        continue;
      }
      const item = await this.tracker.startItem({
        jobId,
        matchId,
        currentStep: 'ai_draft',
      });
      try {
        await this.aiReport.generate(matchId, { forceRegenerate: true });
        await this.tracker.finishItem(item.id, 'SUCCESS');
        ok += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.tracker.finishItem(item.id, 'FAILED', { errorMessage: msg });
      }
    }
    return { ok, skipped, total: matchIds.length };
  }

  private async coverageReport(matchIds: string[]) {
    let green = 0;
    let yellow = 0;
    let red = 0;
    let aiPublishable = 0;
    const allReasons: string[][] = [];
    for (const matchId of matchIds) {
      const c = await this.coverage.getMatchCoverage(matchId);
      if (c.status === 'green') green += 1;
      else if (c.status === 'yellow') yellow += 1;
      else red += 1;
      if (c.gates.aiPublishable) aiPublishable += 1;
      else allReasons.push(c.gates.reasons);
    }
    const aiBlocked = matchIds.length - aiPublishable;
    const topMissing = this.coverage.summarizeTopMissing(allReasons);
    return {
      green,
      yellow,
      red,
      aiPublishable,
      aiBlocked,
      topMissing,
      total: matchIds.length,
    };
  }

  private async runPool(
    matchIds: string[],
    jobId: string,
    maxParallel: number,
    step: string,
    fn: (matchId: string) => Promise<void>,
  ) {
    let succeeded = 0;
    let failed = 0;
    let idx = 0;

    const worker = async () => {
      while (idx < matchIds.length) {
        const i = idx++;
        const matchId = matchIds[i]!;
        const item = await this.tracker.startItem({ jobId, matchId, currentStep: step });
        try {
          await fn(matchId);
          await this.tracker.finishItem(item.id, 'SUCCESS');
          succeeded += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await this.tracker.finishItem(item.id, 'FAILED', { errorMessage: msg });
          failed += 1;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(maxParallel, matchIds.length) }, () => worker()),
    );
    return { succeeded, failed, total: matchIds.length };
  }
}
