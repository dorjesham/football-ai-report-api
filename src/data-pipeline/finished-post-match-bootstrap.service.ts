import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiReportType, MatchStatus, ReportStatus } from '@prisma/client';
import { MatchAfFactsSyncService } from '../api-football/match-af-facts-sync.service';
import { PostMatchBootstrapPublishService } from '../ai-report/post-match-bootstrap-publish.service';
import { PostMatchReportService } from '../ai-report/post-match-report.service';
import { MatchCacheInvalidationService } from '../matches/match-cache-invalidation.service';
import { PredictionGradingService } from '../prediction/prediction-grading.service';
import { PredictionService } from '../prediction/prediction.service';
import { PrismaService } from '../prisma/prisma.service';
import { IngestJobTrackerService } from './ingest-job-tracker.service';

export const FINISHED_BOOTSTRAP_STEP_LABELS = {
  facts: '正在拉进球过程和比分细节',
  predictions: '正在补「谁会赢」的猜测',
  lock: '正在固定开赛前的那份猜测',
  grading: '正在核对猜对还是猜错',
  post_match: '正在写赛后短评',
  publish: '正在把短评放到用户能看到的页面',
  cache: '正在刷新比赛页显示',
} as const;

export type FinishedBootstrapParams = {
  lookbackDays?: number;
  batchSize?: number;
  maxRounds?: number;
  delayBetweenMatchesMs?: number;
  dryRun?: boolean;
};

type BootstrapSummary = {
  dryRun: boolean;
  lookbackDays: number;
  batchSize: number;
  maxRounds: number;
  rounds: number;
  candidateTotal: number;
  processed: number;
  factsOk: number;
  factsSkipped: number;
  factsFailed: number;
  predictionsCreated: number;
  predictionsSkipped: number;
  locked: number;
  graded: number;
  gradingSkipped: number;
  reportsCreated: number;
  reportsSkipped: number;
  published: number;
  publishSkipped: number;
  cacheInvalidated: number;
  errors: string[];
};

@Injectable()
export class FinishedPostMatchBootstrapService {
  private readonly log = new Logger(FinishedPostMatchBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tracker: IngestJobTrackerService,
    private readonly matchAfFacts: MatchAfFactsSyncService,
    private readonly prediction: PredictionService,
    private readonly grading: PredictionGradingService,
    private readonly postMatch: PostMatchReportService,
    private readonly publish: PostMatchBootstrapPublishService,
    private readonly cache: MatchCacheInvalidationService,
  ) {}

  resolveParams(params: FinishedBootstrapParams = {}) {
    return {
      lookbackDays: Math.min(
        365,
        Math.max(
          1,
          params.lookbackDays ??
            this.config.get<number>('finishedBootstrapLookbackDays') ??
            90,
        ),
      ),
      batchSize: Math.min(
        100,
        Math.max(
          1,
          params.batchSize ?? this.config.get<number>('finishedBootstrapBatchSize') ?? 40,
        ),
      ),
      maxRounds: Math.min(
        200,
        Math.max(
          1,
          params.maxRounds ?? this.config.get<number>('finishedBootstrapMaxRounds') ?? 50,
        ),
      ),
      delayBetweenMatchesMs: Math.min(
        30_000,
        Math.max(
          0,
          params.delayBetweenMatchesMs ??
            this.config.get<number>('finishedBootstrapDelayMs') ??
            800,
        ),
      ),
      dryRun: params.dryRun === true,
    };
  }

  async countCandidates(lookbackDays: number): Promise<number> {
    const since = new Date(Date.now() - lookbackDays * 86_400_000);
    return this.prisma.match.count({
      where: {
        status: MatchStatus.FINISHED,
        externalId: { startsWith: 'af-f-' },
        kickoffTime: { gte: since },
      },
    });
  }

  async run(jobId: string, params: FinishedBootstrapParams = {}): Promise<BootstrapSummary> {
    const resolved = this.resolveParams(params);
    const since = new Date(Date.now() - resolved.lookbackDays * 86_400_000);
    const candidateTotal = await this.countCandidates(resolved.lookbackDays);

    const summary: BootstrapSummary = {
      dryRun: resolved.dryRun,
      lookbackDays: resolved.lookbackDays,
      batchSize: resolved.batchSize,
      maxRounds: resolved.maxRounds,
      rounds: 0,
      candidateTotal,
      processed: 0,
      factsOk: 0,
      factsSkipped: 0,
      factsFailed: 0,
      predictionsCreated: 0,
      predictionsSkipped: 0,
      locked: 0,
      graded: 0,
      gradingSkipped: 0,
      reportsCreated: 0,
      reportsSkipped: 0,
      published: 0,
      publishSkipped: 0,
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

    for (let round = 0; round < resolved.maxRounds; round += 1) {
      const batch = await this.prisma.match.findMany({
        where: {
          status: MatchStatus.FINISHED,
          externalId: { startsWith: 'af-f-' },
          kickoffTime: { gte: since },
        },
        orderBy: { kickoffTime: 'desc' },
        skip: round * resolved.batchSize,
        take: resolved.batchSize,
        select: {
          id: true,
          activePredictionId: true,
        },
      });

      if (batch.length === 0) break;
      summary.rounds = round + 1;

      const matchIds = batch.map((r) => r.id);
      const pctBase = Math.round((round / resolved.maxRounds) * 100);
      const itemByMatch = new Map<string, string>();

      await this.tracker.progress(
        jobId,
        pctBase,
        FINISHED_BOOTSTRAP_STEP_LABELS.facts,
        summary,
      );
      for (const { id } of batch) {
        const item = await this.tracker.startItem({
          jobId,
          matchId: id,
          currentStep: 'facts',
        });
        itemByMatch.set(id, item.id);
        try {
          const out = await this.matchAfFacts.syncByMatchId(id, { delayMs: 400 });
          if (out.detail.skipped === true) summary.factsSkipped += 1;
          else summary.factsOk += 1;
        } catch (e) {
          summary.factsFailed += 1;
          pushError(`${id} 拉进球过程: ${e instanceof Error ? e.message : String(e)}`);
        }
        await this.delay(resolved.delayBetweenMatchesMs);
      }

      await this.tracker.progress(
        jobId,
        Math.min(99, pctBase + 8),
        FINISHED_BOOTSTRAP_STEP_LABELS.predictions,
        summary,
      );
      for (const row of batch) {
        if (row.activePredictionId) {
          summary.predictionsSkipped += 1;
          continue;
        }
        try {
          await this.prediction.generateForMatch(row.id, {
            provider: 'auto',
            enrichDeepseek: false,
          });
          summary.predictionsCreated += 1;
        } catch (e) {
          pushError(`${row.id} 补猜测: ${e instanceof Error ? e.message : String(e)}`);
        }
        await this.delay(resolved.delayBetweenMatchesMs);
      }

      await this.tracker.progress(
        jobId,
        Math.min(99, pctBase + 16),
        FINISHED_BOOTSTRAP_STEP_LABELS.lock,
        summary,
      );
      const lockOut = await this.prediction.lockFinishedPredictions({
        matchIds,
        maxMatches: matchIds.length,
      });
      summary.locked += lockOut.locked;

      await this.tracker.progress(
        jobId,
        Math.min(99, pctBase + 24),
        FINISHED_BOOTSTRAP_STEP_LABELS.grading,
        summary,
      );
      const preds = await this.prisma.matchPrediction.findMany({
        where: {
          matchId: { in: matchIds },
          lockedAt: { not: null },
        },
        select: { id: true, matchId: true },
      });
      for (const p of preds) {
        try {
          const out = await this.grading.gradePrediction(p.id);
          if (out.skipped) summary.gradingSkipped += 1;
          else summary.graded += 1;
        } catch (e) {
          pushError(`${p.matchId} 核对猜测: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      await this.tracker.progress(
        jobId,
        Math.min(99, pctBase + 32),
        FINISHED_BOOTSTRAP_STEP_LABELS.post_match,
        summary,
      );
      for (const { id } of batch) {
        const existing = await this.prisma.aiReport.findFirst({
          where: {
            matchId: id,
            reportType: AiReportType.POST_MATCH,
            status: {
              in: [
                ReportStatus.DRAFT,
                ReportStatus.REVIEW,
                ReportStatus.PUBLISHED,
              ],
            },
          },
        });
        if (existing) {
          summary.reportsSkipped += 1;
        } else {
          try {
            await this.postMatch.generatePostMatch(id);
            summary.reportsCreated += 1;
          } catch (e) {
            pushError(`${id} 写赛后短评: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        await this.delay(resolved.delayBetweenMatchesMs);
      }

      await this.tracker.progress(
        jobId,
        Math.min(99, pctBase + 40),
        FINISHED_BOOTSTRAP_STEP_LABELS.publish,
        summary,
      );
      for (const { id } of batch) {
        try {
          const pub = await this.publish.publishPostMatchForBootstrap(id);
          if (pub.published) summary.published += 1;
          else summary.publishSkipped += 1;
        } catch (e) {
          pushError(`${id} 公开短评: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      await this.tracker.progress(
        jobId,
        Math.min(99, pctBase + 48),
        FINISHED_BOOTSTRAP_STEP_LABELS.cache,
        summary,
      );
      for (const { id } of batch) {
        try {
          await this.cache.invalidateAfterMatchDataChange(id);
          summary.cacheInvalidated += 1;
        } catch (e) {
          this.log.warn(`cache ${id}: ${e instanceof Error ? e.message : String(e)}`);
        }
        const itemId = itemByMatch.get(id);
        if (itemId) {
          const failed = summary.errors.some((err) => err.startsWith(`${id} `));
          await this.tracker.finishItem(itemId, failed ? 'FAILED' : 'SUCCESS', {
            currentStep: 'done',
            ...(failed ? { errorCode: 'MATCH_BOOTSTRAP_FAILED' } : {}),
          });
        }
      }

      summary.processed += batch.length;
    }

    await this.tracker.progress(jobId, 100, '补全已结束比赛详情 — 完成', summary);
    return summary;
  }

  async coverage(lookbackDays?: number) {
    const days = this.resolveParams({ lookbackDays }).lookbackDays;
    const since = new Date(Date.now() - days * 86_400_000);
    const baseWhere = {
      status: MatchStatus.FINISHED,
      externalId: { startsWith: 'af-f-' },
      kickoffTime: { gte: since },
    } as const;

    const [finishedTotal, withFacts, withPrediction, withLocked, withGrading, withVisiblePostMatch] =
      await Promise.all([
        this.prisma.match.count({ where: baseWhere }),
        this.prisma.match.count({
          where: { ...baseWhere, matchFacts: { isNot: null } },
        }),
        this.prisma.match.count({
          where: { ...baseWhere, activePredictionId: { not: null } },
        }),
        this.prisma.match.count({
          where: {
            ...baseWhere,
            activePrediction: { is: { lockedAt: { not: null } } },
          },
        }),
        this.prisma.match.count({
          where: {
            ...baseWhere,
            activePrediction: {
              is: { grading: { isNot: null } },
            },
          },
        }),
        this.prisma.match.count({
          where: {
            ...baseWhere,
            aiReports: {
              some: {
                reportType: AiReportType.POST_MATCH,
                status: ReportStatus.PUBLISHED,
              },
            },
          },
        }),
      ]);

    return {
      lookbackDays: days,
      labels: {
        finishedTotal: '已结束的比赛（场）',
        withFacts: '已有进球过程（场）',
        withPrediction: '已有胜负猜测（场）',
        withLocked: '猜测已固定（场）',
        withGrading: '已核对猜对与否（场）',
        withVisiblePostMatch: '用户能看到的赛后短评（场）',
      },
      counts: {
        finishedTotal,
        withFacts,
        withPrediction,
        withLocked,
        withGrading,
        withVisiblePostMatch,
      },
    };
  }

  private delay(ms: number) {
    if (ms <= 0) return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
  }
}
