import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import { MatchIntelFreshnessService } from '../match-intel/match-intel-freshness.service';
import { PredictionService } from '../prediction/prediction.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { AutoPostMatchReportBatchService } from '../ai-report/auto-post-match-report-batch.service';
import { StandingsMaterializeService } from '../data-pipeline/standings-materialize.service';
import { TopscorersMaterializeService } from '../data-pipeline/topscorers-materialize.service';
import {
  WORLD_CUP_COMPETITION_CODE,
  WORLD_CUP_DEFAULT_SEASON,
} from './world-cup-match.util';
import { LocalizationPostIngestHook } from '../localization/localization-post-ingest.hook';

const T48 = 48 * 3600_000;
const T24 = 24 * 3600_000;
const T1 = 3600_000;

@Injectable()
export class WorldCupCronService {
  private readonly log = new Logger(WorldCupCronService.name);
  private running = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly snapshots: MatchAfPreMatchSnapshotService,
    private readonly prediction: PredictionService,
    private readonly weather: WeatherService,
    private readonly freshness: MatchIntelFreshnessService,
    private readonly standings: StandingsMaterializeService,
    private readonly topscorers: TopscorersMaterializeService,
    private readonly postMatchBatch: AutoPostMatchReportBatchService,
    private readonly l10nHook: LocalizationPostIngestHook,
  ) {}

  enabled(): boolean {
    return this.config.get<boolean>('enableWcCron') === true;
  }

  async runPreMatchT48(): Promise<{ processed: number } | { skipped: true }> {
    return this.guarded('wc-pre-match-t48', async () => {
      const ids = await this.wcMatchesInWindow(T48, T24);
      for (const matchId of ids) {
        try {
          await this.snapshots.syncByMatchId(matchId, { phase: 'T24', delayMs: 300 });
        } catch (e) {
          this.log.warn(`t48 snapshot ${matchId}: ${e}`);
        }
      }
      return { processed: ids.length };
    });
  }

  async runPreMatchT24(): Promise<{ processed: number } | { skipped: true }> {
    return this.guarded('wc-pre-match-t24', async () => {
      const ids = await this.wcMatchesInWindow(T24, 0);
      for (const matchId of ids) {
        try {
          await this.afSync.syncSingleMatchFull(matchId, { delayMs: 400 });
          if (await this.hasCity(matchId)) {
            await this.weather.syncForMatch(matchId);
          }
          await this.prediction.generateForMatch(matchId, { provider: 'af' });
          await this.freshness.refreshIntelContentHash(matchId);
          const row = await this.prisma.match.findUnique({
            where: { id: matchId },
            select: { id: true, city: true, venueName: true },
          });
          if (row) await this.l10nHook.onMatchUpsert(row);
        } catch (e) {
          this.log.warn(`t24 ${matchId}: ${e}`);
        }
      }
      return { processed: ids.length };
    });
  }

  async runPreMatchT1(): Promise<{ processed: number } | { skipped: true }> {
    return this.guarded('wc-pre-match-t1', async () => {
      const ids = await this.wcMatchesInWindow(T1, 0);
      for (const matchId of ids) {
        try {
          await this.prediction.generateForMatch(matchId, { provider: 'af', forceRefresh: true });
          await this.freshness.markStaleAiReports(matchId);
        } catch (e) {
          this.log.warn(`t1 ${matchId}: ${e}`);
        }
      }
      return { processed: ids.length };
    });
  }

  async runLiveTick(): Promise<{ processed: number } | { skipped: true }> {
    return this.guarded('wc-live-tick', async () => {
      const ids = await this.listWcMatchIds({ status: MatchStatus.LIVE });
      for (const matchId of ids) {
        try {
          await this.afSync.syncSingleMatchFull(matchId, { delayMs: 250 });
        } catch (e) {
          this.log.warn(`live ${matchId}: ${e}`);
        }
      }
      return { processed: ids.length };
    });
  }

  async runPostMatch(): Promise<Record<string, unknown> | { skipped: true }> {
    return this.guarded('wc-post-match', async () => {
      const season = WORLD_CUP_DEFAULT_SEASON;
      await this.standings.syncCode(WORLD_CUP_COMPETITION_CODE, season);
      await this.topscorers.syncWcLeaderboardsFull(WORLD_CUP_COMPETITION_CODE, season);
      const finished = await this.listWcMatchIds({ status: MatchStatus.FINISHED });
      let synced = 0;
      for (const matchId of finished.slice(0, 30)) {
        try {
          await this.afSync.syncSingleMatchFull(matchId, { force: true, delayMs: 500 });
          synced += 1;
        } catch {
          /* skip */
        }
      }
      const ai = await this.postMatchBatch.runScheduledTick();
      return { standings: true, leaderboards: true, afSynced: synced, ai };
    });
  }

  private async guarded<T extends Record<string, unknown>>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T | { skipped: true }> {
    if (!this.enabled()) return { skipped: true };
    if (this.running.has(key)) return { skipped: true };
    this.running.add(key);
    try {
      return await fn();
    } finally {
      this.running.delete(key);
    }
  }

  private async wcMatchesInWindow(maxAheadMs: number, minAheadMs: number) {
    const now = Date.now();
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    if (!comp) return [];
    const rows = await this.prisma.match.findMany({
      where: {
        competitionId: comp.id,
        externalId: { startsWith: 'af-f-' },
        status: MatchStatus.SCHEDULED,
        kickoffTime: {
          gte: new Date(now + minAheadMs),
          lte: new Date(now + maxAheadMs),
        },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async listWcMatchIds(opts?: { status?: MatchStatus }) {
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
      select: { id: true },
    });
    if (!comp) return [];
    const rows = await this.prisma.match.findMany({
      where: {
        competitionId: comp.id,
        externalId: { startsWith: 'af-f-' },
        ...(opts?.status ? { status: opts.status } : {}),
      },
      select: { id: true },
      take: 200,
    });
    return rows.map((r) => r.id);
  }

  private async hasCity(matchId: string) {
    const m = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { city: true },
    });
    return Boolean(m?.city?.trim());
  }
}
