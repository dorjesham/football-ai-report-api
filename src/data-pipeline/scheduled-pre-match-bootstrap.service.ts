import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { AiReportService } from '../ai-report/ai-report.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import { MatchOddsSnapshotService } from '../api-football/match-odds-snapshot.service';
import { MatchCacheInvalidationService } from '../matches/match-cache-invalidation.service';
import { resolvePreMatchPhase } from '../common/utils/pre-match-phase.util';
import { PrismaService } from '../prisma/prisma.service';

export { resolvePreMatchPhase } from '../common/utils/pre-match-phase.util';
import { IngestJobTrackerService } from './ingest-job-tracker.service';

export const SCHEDULED_BOOTSTRAP_STEP_LABELS = {
  snapshot: '正在同步赛前快照（积分榜/战绩/伤停）',
  odds: '正在采集赔率快照（T24/T1）',
  af_raw_sync: '正在同步 API-Football Raw 全量（sync-full）',
  ai_draft: '正在生成赛前 AI 草稿（不自动发布）',
  cache: '正在刷新详情页缓存',
} as const;

export type ScheduledBootstrapParams = {
  lookaheadDays?: number;
  batchSize?: number;
  maxRounds?: number;
  delayBetweenMatchesMs?: number;
  dryRun?: boolean;
  skipAiReport?: boolean;
};

export type ScheduledBootstrapSummary = {
  dryRun: boolean;
  lookaheadDays: number;
  batchSize: number;
  maxRounds: number;
  rounds: number;
  candidateTotal: number;
  processed: number;
  snapshotOk: number;
  snapshotSkipped: number;
  snapshotFailed: number;
  oddsT24Ok: number;
  oddsT1Ok: number;
  oddsFailed: number;
  afSyncOk: number;
  afSyncFailed: number;
  aiDraftOk: number;
  aiDraftFailed: number;
  intelOk: number;
  intelPartial: number;
  intelFailed: number;
  cacheInvalidated: number;
  errors: string[];
};

@Injectable()
export class ScheduledPreMatchBootstrapService {
  private readonly log = new Logger(ScheduledPreMatchBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tracker: IngestJobTrackerService,
    private readonly preMatchSnapshots: MatchAfPreMatchSnapshotService,
    private readonly oddsSnapshots: MatchOddsSnapshotService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly aiReport: AiReportService,
    private readonly cache: MatchCacheInvalidationService,
  ) {}

  resolveParams(params: ScheduledBootstrapParams = {}) {
    return {
      lookaheadDays: Math.min(
        30,
        Math.max(
          1,
          params.lookaheadDays ??
            this.config.get<number>('scheduledBootstrapLookaheadDays') ??
            10,
        ),
      ),
      batchSize: Math.min(
        50,
        Math.max(
          1,
          params.batchSize ?? this.config.get<number>('scheduledBootstrapBatchSize') ?? 20,
        ),
      ),
      maxRounds: Math.min(
        200,
        Math.max(
          1,
          params.maxRounds ?? this.config.get<number>('scheduledBootstrapMaxRounds') ?? 50,
        ),
      ),
      delayBetweenMatchesMs: Math.min(
        30_000,
        Math.max(
          0,
          params.delayBetweenMatchesMs ??
            this.config.get<number>('scheduledBootstrapDelayMs') ??
            1200,
        ),
      ),
      dryRun: params.dryRun === true,
      skipAiReport: params.skipAiReport === true,
    };
  }

  private windowEnd(lookaheadDays: number) {
    return new Date(Date.now() + lookaheadDays * 86_400_000);
  }

  async countCandidates(lookaheadDays: number): Promise<number> {
    const now = new Date();
    return this.prisma.match.count({
      where: {
        status: MatchStatus.SCHEDULED,
        externalId: { startsWith: 'af-f-' },
        kickoffTime: { gte: now, lte: this.windowEnd(lookaheadDays) },
      },
    });
  }

  async coverage(lookaheadDays = 10) {
    const resolved = this.resolveParams({ lookaheadDays });
    const now = new Date();
    const end = this.windowEnd(resolved.lookaheadDays);
    const rows = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.SCHEDULED,
        externalId: { startsWith: 'af-f-' },
        kickoffTime: { gte: now, lte: end },
      },
      select: {
        id: true,
        activePredictionId: true,
        afPreMatchSnapshot24At: true,
        afPreMatchSnapshot1At: true,
        afOddsSnapshot24At: true,
        afOddsSnapshot1At: true,
        _count: {
          select: {
            tacticalScenarios: true,
            playerIntelligence: true,
          },
        },
      },
    });
    const total = rows.length;
    const missingSnapshot = rows.filter(
      (r) => !r.afPreMatchSnapshot24At || !r.afPreMatchSnapshot1At,
    ).length;
    const missingOdds = rows.filter(
      (r) => !r.afOddsSnapshot24At || !r.afOddsSnapshot1At,
    ).length;
    const missingPrediction = rows.filter((r) => !r.activePredictionId).length;
    const missingTactics = rows.filter((r) => r._count.tacticalScenarios === 0).length;
    const missingPlayerIntel = rows.filter(
      (r) => r._count.playerIntelligence === 0,
    ).length;
    return {
      lookaheadDays: resolved.lookaheadDays,
      total,
      missingSnapshot,
      missingOdds,
      missingPrediction,
      missingTactics,
      missingPlayerIntel,
    };
  }

  async run(
    jobId: string,
    params: ScheduledBootstrapParams = {},
  ): Promise<ScheduledBootstrapSummary> {
    const resolved = this.resolveParams(params);
    const now = new Date();
    const end = this.windowEnd(resolved.lookaheadDays);
    const candidateTotal = await this.countCandidates(resolved.lookaheadDays);

    const summary: ScheduledBootstrapSummary = {
      dryRun: resolved.dryRun,
      lookaheadDays: resolved.lookaheadDays,
      batchSize: resolved.batchSize,
      maxRounds: resolved.maxRounds,
      rounds: 0,
      candidateTotal,
      processed: 0,
      snapshotOk: 0,
      snapshotSkipped: 0,
      snapshotFailed: 0,
      oddsT24Ok: 0,
      oddsT1Ok: 0,
      oddsFailed: 0,
      afSyncOk: 0,
      afSyncFailed: 0,
      aiDraftOk: 0,
      aiDraftFailed: 0,
      intelOk: 0,
      intelPartial: 0,
      intelFailed: 0,
      cacheInvalidated: 0,
      errors: [],
    };

    const pushError = (msg: string) => {
      if (summary.errors.length < 40) summary.errors.push(msg);
    };

    if (resolved.dryRun) {
      summary.processed = Math.min(
        candidateTotal,
        resolved.batchSize * resolved.maxRounds,
      );
      await this.tracker.progress(jobId, 100, '试跑完成（未写入数据）', summary);
      return summary;
    }

    const afKey = this.config.get<string>('apiFootballApiKey')?.trim();
    if (!afKey) {
      pushError('缺少 API_FOOTBALL_API_KEY');
      await this.tracker.finish(jobId, false, summary, 'no API_FOOTBALL_API_KEY');
      return summary;
    }

    for (let round = 0; round < resolved.maxRounds; round += 1) {
      const batch = await this.prisma.match.findMany({
        where: {
          status: MatchStatus.SCHEDULED,
          externalId: { startsWith: 'af-f-' },
          kickoffTime: { gte: now, lte: end },
        },
        orderBy: { kickoffTime: 'asc' },
        skip: round * resolved.batchSize,
        take: resolved.batchSize,
        select: { id: true, kickoffTime: true },
      });

      if (batch.length === 0) break;
      summary.rounds = round + 1;
      const pctBase = Math.round((round / resolved.maxRounds) * 100);

      for (const row of batch) {
        summary.processed += 1;
        const phase = resolvePreMatchPhase(now, row.kickoffTime);
        let itemId: string | undefined;
        let matchFailed = false;

        try {
          itemId = (
            await this.tracker.startItem({
              jobId,
              matchId: row.id,
              currentStep: 'snapshot',
            })
          ).id;

          await this.tracker.progress(
            jobId,
            Math.min(99, pctBase + 5),
            SCHEDULED_BOOTSTRAP_STEP_LABELS.snapshot,
            summary,
          );
          try {
            const snap = await this.preMatchSnapshots.syncByMatchId(row.id, {
              force: true,
              phase,
              delayMs: 400,
            });
            if (snap.detail.skipped) summary.snapshotSkipped += 1;
            else summary.snapshotOk += 1;
          } catch (e) {
            summary.snapshotFailed += 1;
            matchFailed = true;
            pushError(`${row.id} 快照: ${e instanceof Error ? e.message : String(e)}`);
          }

          await this.tracker.progress(
            jobId,
            Math.min(99, pctBase + 15),
            SCHEDULED_BOOTSTRAP_STEP_LABELS.odds,
            summary,
          );
          for (const oddsPhase of ['T24', 'T1'] as const) {
            try {
              const out = await this.oddsSnapshots.captureByMatchId(row.id, oddsPhase, {
                force: true,
              });
              if (!out.skipped) {
                if (oddsPhase === 'T24') summary.oddsT24Ok += 1;
                else summary.oddsT1Ok += 1;
              }
            } catch (e) {
              summary.oddsFailed += 1;
              matchFailed = true;
              pushError(
                `${row.id} 赔率${oddsPhase}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }

          await this.tracker.progress(
            jobId,
            Math.min(99, pctBase + 40),
            SCHEDULED_BOOTSTRAP_STEP_LABELS.af_raw_sync,
            summary,
          );
          try {
            await this.afSync.syncSingleMatchFull(row.id, { force: true });
            summary.afSyncOk += 1;
            summary.intelOk += 1;
          } catch (e) {
            summary.afSyncFailed += 1;
            summary.intelFailed += 1;
            matchFailed = true;
            pushError(
              `${row.id} AF sync-full: ${e instanceof Error ? e.message : String(e)}`,
            );
          }

          if (!resolved.skipAiReport) {
            await this.tracker.progress(
              jobId,
              Math.min(99, pctBase + 55),
              SCHEDULED_BOOTSTRAP_STEP_LABELS.ai_draft,
              summary,
            );
            try {
              await this.aiReport.generate(row.id, { skipExternalPreparation: true });
              summary.aiDraftOk += 1;
            } catch (e) {
              summary.aiDraftFailed += 1;
              matchFailed = true;
              pushError(
                `${row.id} AI 草稿: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }

          try {
            await this.cache.invalidateAfterMatchDataChange(row.id);
            summary.cacheInvalidated += 1;
          } catch (e) {
            pushError(`${row.id} 清缓存: ${e instanceof Error ? e.message : String(e)}`);
          }
        } finally {
          if (itemId) {
            await this.tracker.finishItem(
              itemId,
              matchFailed ? 'FAILED' : 'SUCCESS',
              {
                currentStep: 'done',
                ...(matchFailed ? { errorCode: 'MATCH_BOOTSTRAP_FAILED' } : {}),
              },
            );
          }
        }

        await this.delay(resolved.delayBetweenMatchesMs);
      }
    }

    await this.tracker.progress(jobId, 100, '未开赛详情补全完成', summary);
    return summary;
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
