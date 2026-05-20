import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WorldCupBootstrapService, type WorldCupBootstrapParams } from '../world-cup/world-cup-bootstrap.service';
import { WorldCupCoverageService } from '../world-cup/world-cup-coverage.service';
import {
  WORLD_CUP_COMPETITION_CODE,
  WORLD_CUP_DEFAULT_SEASON,
} from '../world-cup/world-cup-match.util';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import { PredictionService } from '../prediction/prediction.service';
import { WeatherService } from '../weather/weather.service';
import { MatchIntelFreshnessService } from '../match-intel/match-intel-freshness.service';
import { AiReportService } from '../ai-report/ai-report.service';
import { IngestJobTrackerService } from '../data-pipeline/ingest-job-tracker.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { StandingsMaterializeService } from '../data-pipeline/standings-materialize.service';
import { TopscorersMaterializeService } from '../data-pipeline/topscorers-materialize.service';
import { WorldCupExtendedSyncService } from '../world-cup/world-cup-extended-sync.service';
import { LocalizationService } from '../localization/localization.service';

@Injectable()
export class WorldCupAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bootstrap: WorldCupBootstrapService,
    private readonly coverage: WorldCupCoverageService,
    private readonly tracker: IngestJobTrackerService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly snapshots: MatchAfPreMatchSnapshotService,
    private readonly prediction: PredictionService,
    private readonly weather: WeatherService,
    private readonly freshness: MatchIntelFreshnessService,
    private readonly aiReport: AiReportService,
    private readonly afIngest: ApiFootballIngestService,
    private readonly standings: StandingsMaterializeService,
    private readonly topscorers: TopscorersMaterializeService,
    private readonly extended: WorldCupExtendedSyncService,
    private readonly l10n: LocalizationService,
  ) {}

  async getOverview() {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    const matchWhere = comp ?
      { competitionId: comp.id, externalId: { startsWith: 'af-f-' } as const }
    : { id: 'none' };

    const [totalMatches, teamsCount, playersCount, jobs] = await Promise.all([
      this.prisma.match.count({ where: matchWhere }),
      this.prisma.team.count({
        where: { externalId: { startsWith: 'af-t-' } },
      }),
      this.prisma.player.count({
        where: { externalId: { startsWith: 'af-p-' } },
      }),
      this.prisma.ingestJobRun.findMany({
        where: {
          OR: [
            { kind: 'worldcup_af_full_bootstrap' },
            { bundleId: 'worldcup_af_full_bootstrap' },
          ],
        },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          kind: true,
          status: true,
          progressPct: true,
          startedAt: true,
          stepLabel: true,
        },
      }),
    ]);

    let green = 0;
    let yellow = 0;
    let red = 0;
    let aiPublishable = 0;
    let aiBlocked = 0;
    const missing = {
      predictions: 0,
      snapshots: 0,
      weather: 0,
      odds: 0,
    };

    if (comp && totalMatches > 0) {
      const sample = await this.prisma.match.findMany({
        where: matchWhere,
        select: { id: true },
        take: 80,
        orderBy: { kickoffTime: 'asc' },
      });
      for (const m of sample) {
        const c = await this.coverage.getMatchCoverage(m.id);
        if (c.status === 'green') green += 1;
        else if (c.status === 'yellow') yellow += 1;
        else red += 1;
        if (c.gates.aiPublishable) aiPublishable += 1;
        else aiBlocked += 1;
        if (c.gates.reasons.includes('missing_af_predictions')) missing.predictions += 1;
        if (c.gates.reasons.includes('missing_team_snapshots')) missing.snapshots += 1;
        if (c.endpoints.some((e) => e.id === 'weather' && e.status === 'missing')) {
          missing.weather += 1;
        }
      }
    }

    return {
      season: WORLD_CUP_DEFAULT_SEASON,
      competitionCode: WORLD_CUP_COMPETITION_CODE,
      totalMatches,
      teamsCount,
      playersCount,
      coverage: { green, yellow, red },
      gates: { aiPublishable, aiBlocked },
      missing,
      recentJobs: jobs.map((j) => ({
        id: j.id,
        name: j.kind,
        status: j.status,
        progress: j.progressPct,
        startedAt: j.startedAt.toISOString(),
        stepLabel: j.stepLabel,
      })),
      env: {
        afConfigured: Boolean(this.config.get<string>('apiFootballApiKey')?.trim()),
        qweatherConfigured: Boolean(this.config.get<string>('qweatherApiKey')?.trim()),
        factsDualWrite: this.config.get<boolean>('enableAfFactsDualWrite') === true,
        predictionProvider: this.config.get<string>('predictionProvider'),
      },
    };
  }

  startBootstrap(params: WorldCupBootstrapParams) {
    return this.bootstrap.startBootstrap(params);
  }

  async listMatches(opts: {
    coverage?: 'red' | 'yellow' | 'green';
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
    });
    if (!comp) return { items: [], total: 0 };

    const rows = await this.prisma.match.findMany({
      where: {
        competitionId: comp.id,
        externalId: { startsWith: 'af-f-' },
        ...(opts.status ? { status: opts.status as never } : {}),
      },
      include: {
        homeTeam: { select: { nameCn: true } },
        awayTeam: { select: { nameCn: true } },
      },
      orderBy: { kickoffTime: 'asc' },
      take: Math.min(200, opts.limit ?? 50),
      skip: ((opts.page ?? 1) - 1) * (opts.limit ?? 50),
    });

    const items = [];
    for (const row of rows) {
      const cov = await this.coverage.getMatchCoverage(row.id);
      if (opts.coverage && cov.status !== opts.coverage) continue;
      items.push({
        matchId: row.id,
        externalId: row.externalId,
        kickoffAt: row.kickoffTime.toISOString(),
        homeTeam: row.homeTeam.nameCn,
        awayTeam: row.awayTeam.nameCn,
        status: row.status,
        coverageStatus: cov.status,
        aiStatus: cov.gates.aiPublishable ? 'publishable' : 'blocked',
        isAiPublishable: cov.gates.aiPublishable,
        missingReasons: cov.gates.reasons,
      });
    }
    return { items, total: items.length };
  }

  getMatchCoverage(matchId: string) {
    return this.coverage.getMatchCoverage(matchId);
  }

  async reconcileMatch(
    matchId: string,
    opts: { includeAi?: boolean; dryRun?: boolean; extended?: boolean },
  ) {
    if (opts.dryRun) {
      return { jobId: null, dryRun: true, steps: ['sync-full', 'snapshot', 'prediction', 'weather', 'freshness'] };
    }

    const job = await this.tracker.start({
      kind: 'worldcup_match_reconcile',
      params: { matchId, includeAi: opts.includeAi },
      stepLabel: 'reconcile',
    });

    void (async () => {
      try {
        await this.afSync.syncSingleMatchFull(matchId, { delayMs: 400 });
        await this.snapshots.syncByMatchId(matchId, { phase: 'T24', delayMs: 400 });
        await this.prediction.generateForMatch(matchId, { provider: 'af' });
        const m = await this.prisma.match.findUnique({
          where: { id: matchId },
          select: { city: true, kickoffTime: true },
        });
        if (m?.city?.trim()) {
          try {
            await this.weather.syncForMatch(matchId);
          } catch {
            /* best-effort */
          }
        }
        await this.freshness.refreshIntelContentHash(matchId);
        if (opts.extended) {
          try {
            await this.extended.syncOddsLiveForMatch(matchId);
          } catch {
            /* optional */
          }
        }
        if (opts.includeAi) {
          await this.aiReport.generate(matchId, { forceRegenerate: true });
        }
        const cov = await this.coverage.getMatchCoverage(matchId);
        await this.tracker.finish(job.id, true, { coverage: cov.status });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.tracker.finish(job.id, false, {}, msg);
      }
    })();

    return { jobId: job.id };
  }

  async listTeams() {
    const teams = await this.prisma.team.findMany({
      where: { externalId: { startsWith: 'af-t-' } },
      orderBy: { nameCn: 'asc' },
      include: {
        _count: { select: { players: true } },
      },
    });
    return {
      items: teams.map((t) => {
        const prof =
          t.wc2026Profile && typeof t.wc2026Profile === 'object' ?
            (t.wc2026Profile as Record<string, unknown>)
          : {};
        const af = prof.af && typeof prof.af === 'object' ? prof.af : {};
        return {
          teamId: t.id,
          apiFootballTeamId:
            t.apiFootballTeamId ??
            (Number(t.externalId?.replace(/^af-t-/, '') || 0) || null),
          name: t.nameCn,
          country: t.country,
          logoUrl: t.logoUrl,
          hasSquad: t._count.players > 0,
          hasStatistics: Boolean(
            af && typeof af === 'object' && (af as Record<string, unknown>).statistics,
          ),
          playerCount: t._count.players,
          profileUpdatedAt: t.updatedAt.toISOString(),
        };
      }),
    };
  }

  async refreshTeamProfile(teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, externalId: { startsWith: 'af-t-' } },
    });
    if (!team) return { jobId: null, error: 'team_not_found' };
    const job = await this.tracker.start({
      kind: 'worldcup_team_profile_refresh',
      params: { teamId },
    });
    void this.afIngest
      .syncWc2026TeamProfilesFromApiFootball({
        season: WORLD_CUP_DEFAULT_SEASON,
        maxTeams: 56,
      })
      .then((r) => this.tracker.finish(job.id, true, r as Record<string, unknown>))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        return this.tracker.finish(job.id, false, {}, msg);
      });
    return { jobId: job.id };
  }

  async batchPredictions(opts: { matchIds?: string[]; onlyMissing?: boolean }) {
    const ids = opts.matchIds?.length ?
      opts.matchIds
    : await this.listAllWcMatchIds();
    const job = await this.tracker.start({
      kind: 'worldcup_predictions_generate',
      params: opts as Record<string, unknown>,
    });
    void this.runMatchBatch(job.id, ids, async (matchId) => {
      const m = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: { activePredictionId: true },
      });
      if (opts.onlyMissing && m?.activePredictionId) return;
      await this.prediction.generateForMatch(matchId, { provider: 'af' });
      await this.freshness.refreshIntelContentHash(matchId);
    }).then((s) => this.tracker.finish(job.id, true, s))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        return this.tracker.finish(job.id, false, {}, msg);
      });
    return { jobId: job.id };
  }

  async batchAiDrafts(opts: {
    matchIds?: string[];
    onlyPublishable?: boolean;
    forceRegenerateDraft?: boolean;
  }) {
    const ids = opts.matchIds?.length ?
      opts.matchIds
    : await this.listAllWcMatchIds();
    const job = await this.tracker.start({
      kind: 'worldcup_ai_drafts_generate',
      params: opts as Record<string, unknown>,
    });
    void this.runMatchBatch(job.id, ids, async (matchId) => {
      if (opts.onlyPublishable) {
        const g = await this.coverage.evaluatePublishGate(matchId);
        if (!g.aiPublishable) return;
      } else {
        const g = await this.coverage.evaluateGenerateGate(matchId);
        if (!g.aiGeneratable) return;
      }
      await this.aiReport.generate(matchId, {
        forceRegenerate: opts.forceRegenerateDraft === true,
      });
    }).then((s) => this.tracker.finish(job.id, true, s))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        return this.tracker.finish(job.id, false, {}, msg);
      });
    return { jobId: job.id };
  }

  private async listAllWcMatchIds(): Promise<string[]> {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    if (!comp) return [];
    const rows = await this.prisma.match.findMany({
      where: { competitionId: comp.id, externalId: { startsWith: 'af-f-' } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async runMatchBatch(
    jobId: string,
    matchIds: string[],
    fn: (matchId: string) => Promise<void>,
  ) {
    let succeeded = 0;
    let failed = 0;
    for (const matchId of matchIds) {
      const item = await this.tracker.startItem({ jobId, matchId });
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
    return { succeeded, failed, total: matchIds.length };
  }

  async listTeamNameOverrides() {
    const rows = await this.prisma.afTeamNameOverride.findMany({
      orderBy: { apiFootballTeamId: 'asc' },
    });
    return { items: rows };
  }

  async upsertTeamNameOverride(apiFootballTeamId: number, nameCn: string) {
    const row = await this.prisma.afTeamNameOverride.upsert({
      where: { apiFootballTeamId },
      create: { apiFootballTeamId, nameCn },
      update: { nameCn },
    });
    const team = await this.prisma.team.findFirst({
      where: { externalId: `af-t-${apiFootballTeamId}` },
    });
    if (team) {
      await this.prisma.team.update({
        where: { id: team.id },
        data: { nameCn },
      });
      await this.l10n.upsertTranslation({
        entityType: 'team',
        entityId: team.id,
        externalId: String(apiFootballTeamId),
        sourceText: team.nameEn,
        translatedText: nameCn,
        source: 'admin',
        status: 'approved',
        locked: true,
      });
    }
    return row;
  }

  async getStandings(season = WORLD_CUP_DEFAULT_SEASON) {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    if (!comp) return { items: [] };
    const rows = await this.prisma.competitionStanding.findMany({
      where: { competitionId: comp.id, seasonYear: season },
      include: { team: { select: { nameCn: true, externalId: true } } },
      orderBy: [{ groupName: 'asc' }, { rank: 'asc' }],
    });
    return { items: rows };
  }

  async getLeaderboards(season = WORLD_CUP_DEFAULT_SEASON, metric = 'goals') {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    if (!comp) return { items: [] };
    const rows = await this.prisma.playerSeasonMetric.findMany({
      where: { competitionId: comp.id, seasonYear: season, metric },
      orderBy: { rank: 'asc' },
      take: 50,
      include: {
        player: { select: { nameCn: true, externalId: true } },
        team: { select: { nameCn: true } },
      },
    });
    return { items: rows, metric };
  }

  async patchTeamManual(
    teamId: string,
    manual: Record<string, unknown>,
  ) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, externalId: { startsWith: 'af-t-' } },
    });
    if (!team) return { error: 'team_not_found' };
    const prof =
      team.wc2026Profile && typeof team.wc2026Profile === 'object' ?
        { ...(team.wc2026Profile as Record<string, unknown>) }
      : { source: 'AF', af: {}, manual: {} };
    const m =
      prof.manual && typeof prof.manual === 'object' ?
        { ...(prof.manual as Record<string, unknown>) }
      : {};
    prof.manual = { ...m, ...manual, updatedAt: new Date().toISOString() };
    const ver = typeof m.contentVersion === 'number' ? m.contentVersion + 1 : 1;
    (prof.manual as Record<string, unknown>).contentVersion = ver;
    await this.prisma.team.update({
      where: { id: teamId },
      data: { wc2026Profile: prof as never },
    });
    return { ok: true, contentVersion: ver };
  }
}
