import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type JobItemFinishStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

@Injectable()
export class IngestJobTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  async start(opts: {
    kind: string;
    bundleId?: string;
    parentJobId?: string;
    params?: Record<string, unknown>;
    stepLabel?: string;
  }) {
    return this.prisma.ingestJobRun.create({
      data: {
        kind: opts.kind,
        bundleId: opts.bundleId,
        parentJobId: opts.parentJobId,
        status: 'RUNNING',
        progressPct: 0,
        stepLabel: opts.stepLabel ?? 'starting',
        params: (opts.params ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findRunningBundleJob(bundleId: string) {
    return this.prisma.ingestJobRun.findFirst({
      where: { bundleId, status: 'RUNNING' },
      orderBy: { startedAt: 'desc' },
    });
  }

  async progress(
    jobId: string,
    pct: number,
    stepLabel: string,
    patch?: Record<string, unknown>,
  ) {
    const existing = await this.prisma.ingestJobRun.findUnique({
      where: { id: jobId },
    });
    const prev =
      existing?.resultSummary && typeof existing.resultSummary === 'object'
        ? (existing.resultSummary as Record<string, unknown>)
        : {};
    await this.prisma.ingestJobRun.update({
      where: { id: jobId },
      data: {
        progressPct: Math.min(100, Math.max(0, Math.round(pct))),
        stepLabel,
        ...(patch
          ? { resultSummary: { ...prev, ...patch } as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async startItem(opts: {
    jobId: string;
    matchId?: string;
    itemType?: string;
    currentStep?: string;
  }) {
    return this.prisma.ingestJobItem.create({
      data: {
        jobId: opts.jobId,
        matchId: opts.matchId,
        itemType: opts.itemType ?? 'match',
        status: 'RUNNING',
        currentStep: opts.currentStep,
        startedAt: new Date(),
      },
    });
  }

  async finishItem(
    itemId: string,
    status: JobItemFinishStatus,
    opts?: { errorCode?: string; errorMessage?: string; currentStep?: string },
  ) {
    await this.prisma.ingestJobItem.update({
      where: { id: itemId },
      data: {
        status,
        currentStep: opts?.currentStep,
        errorCode: opts?.errorCode,
        errorMessage: opts?.errorMessage?.slice(0, 4000),
        finishedAt: new Date(),
      },
    });
  }

  /**
   * Derives job status from bootstrap summary counters when present.
   */
  resolveJobOk(summary: Record<string, unknown>, hardFail: boolean): {
    ok: boolean;
    status: string;
  } {
    if (hardFail) return { ok: false, status: 'FAILED' };

    const failed =
      Number(summary.factsFailed ?? 0) +
      Number(summary.snapshotFailed ?? 0) +
      Number(summary.oddsFailed ?? 0) +
      Number(summary.intelFailed ?? 0) +
      Number(summary.afSyncFailed ?? 0) +
      (Array.isArray(summary.errors) ? summary.errors.length : 0);

    const processed = Number(summary.processed ?? 0);
    const successHints =
      Number(summary.factsOk ?? 0) +
      Number(summary.snapshotOk ?? 0) +
      Number(summary.intelOk ?? 0) +
      Number(summary.afSyncOk ?? 0) +
      Number(summary.reportsCreated ?? 0);

    if (failed > 0 && processed > 0 && successHints > 0) {
      return { ok: true, status: 'PARTIAL_SUCCESS' };
    }
    if (failed > 0 && successHints === 0 && processed > 0) {
      return { ok: false, status: 'FAILED' };
    }
    return { ok: true, status: 'SUCCEEDED' };
  }

  async cancelJob(jobId: string) {
    const job = await this.prisma.ingestJobRun.findUnique({ where: { id: jobId } });
    if (!job) return { ok: false, reason: 'not_found' };
    if (job.status !== 'RUNNING') {
      return { ok: false, reason: 'not_running', status: job.status };
    }
    await this.prisma.ingestJobRun.update({
      where: { id: jobId },
      data: {
        status: 'CANCELED',
        finishedAt: new Date(),
        stepLabel: '已取消',
      },
    });
    return { ok: true, jobId };
  }

  async finish(
    jobId: string,
    ok: boolean,
    summary: Record<string, unknown>,
    errorMessage?: string,
  ) {
    const resolved = this.resolveJobOk(summary, !ok);
    await this.prisma.ingestJobRun.update({
      where: { id: jobId },
      data: {
        status: resolved.status,
        progressPct: resolved.ok || resolved.status === 'PARTIAL_SUCCESS' ? 100 : undefined,
        finishedAt: new Date(),
        resultSummary: summary as Prisma.InputJsonValue,
        errorMessage: errorMessage?.slice(0, 4000),
      },
    });
  }
}
