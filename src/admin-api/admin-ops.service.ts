import { Injectable } from '@nestjs/common';
import { MatchStatus, OrderStatus, ReportStatus, UserRole } from '@prisma/client';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinishedPostMatchBootstrapService } from '../data-pipeline/finished-post-match-bootstrap.service';
import { ScheduledPreMatchBootstrapService } from '../data-pipeline/scheduled-pre-match-bootstrap.service';
import { AdminLiveCoverageService } from './admin-live-coverage.service';
import type {
  BootstrapStatusResponse,
  BootstrapStepKey,
  DailySummaryResponse,
  MatchHealthSummary,
  OverviewCards,
  RecentIncident,
  StepStatus,
  TodoItem,
} from './admin-ops.types';

const TERMINAL_JOB = new Set([
  'SUCCESS',
  'SUCCEEDED',
  'PARTIAL_SUCCESS',
  'FAILED',
]);

@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly afQuota: ApiFootballQuotaService,
    private readonly scheduledBootstrap: ScheduledPreMatchBootstrapService,
    private readonly finishedBootstrap: FinishedPostMatchBootstrapService,
    private readonly liveCoverage: AdminLiveCoverageService,
  ) {}

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfToday(): Date {
    const d = this.startOfToday();
    d.setDate(d.getDate() + 1);
    return d;
  }

  async getOverviewCards(): Promise<OverviewCards> {
    const today = this.startOfToday();
    const tomorrow = this.endOfToday();
    const [
      totalUsers,
      todayNewUsers,
      todayKickoffMatches,
      liveMatches,
      pendingAiDrafts,
      todayRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      this.prisma.match.count({
        where: { kickoffTime: { gte: today, lt: tomorrow } },
      }),
      this.prisma.match.count({ where: { status: MatchStatus.LIVE } }),
      this.prisma.aiReport.count({
        where: { status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] } },
      }),
      this.prisma.order.aggregate({
        where: {
          status: OrderStatus.PAID,
          paidAt: { gte: today, lt: tomorrow },
        },
        _sum: { amount: true },
      }),
    ]);
    return {
      totalUsers,
      todayNewUsers,
      todayKickoffMatches,
      liveMatches,
      pendingAiDrafts,
      todayRevenueCents: todayRevenue._sum.amount ?? 0,
    };
  }

  async getMatchHealthSummary(): Promise<MatchHealthSummary> {
    const [scheduled, finished, live] = await Promise.all([
      this.scheduledBootstrap.coverage(10),
      this.finishedBootstrap.coverage(90),
      this.liveCoverage.coverage(30),
    ]);
    let green = 0;
    let yellow = 0;
    let red = 0;

    const schedRed = scheduled.missingSnapshot + scheduled.missingOdds;
    if (scheduled.total === 0) {
      /* noop */
    } else if (schedRed === 0) green += scheduled.total;
    else if (schedRed < scheduled.total * 0.5) yellow += scheduled.total;
    else red += scheduled.total;

    const finCounts = (finished as { counts?: Record<string, number> }).counts ?? {};
    const finTotal = finCounts.finishedTotal ?? 0;
    const finGap = Math.max(0, finTotal - (finCounts.withFacts ?? 0));
    if (finTotal > 0) {
      if (finGap === 0) green += finTotal;
      else if (finGap < finTotal * 0.5) yellow += finTotal;
      else red += finTotal;
    }

    const liveRows = (live as { items?: Array<{ hasEvents?: boolean }> }).items ?? [];
    for (const row of liveRows) {
      if (row.hasEvents) green++;
      else red++;
    }

    return { green, yellow, red };
  }

  async getTodos(): Promise<TodoItem[]> {
    const todos: TodoItem[] = [];
    const [liveCount, draftReports, quota, scheduledCov, partialJob, paidOrphans] =
      await Promise.all([
        this.prisma.match.count({ where: { status: MatchStatus.LIVE } }),
        this.prisma.aiReport.count({
          where: { status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] } },
        }),
        this.afQuota.snapshot(),
        this.scheduledBootstrap.coverage(10),
        this.prisma.ingestJobRun.findFirst({
          where: { status: 'PARTIAL_SUCCESS' },
          orderBy: { startedAt: 'desc' },
        }),
        this.findPaidOrdersWithoutUnlock(),
      ]);

    if (liveCount > 0) {
      todos.push({
        id: 'live-sync',
        severity: 'warning',
        title: `${liveCount} 场 LIVE 进行中`,
        description: '建议同步赛中数据',
        actionLabel: '去比赛日运维',
        actionRoute: '/ops/daily/matchday',
        actionType: 'navigate',
        completionMode: 'auto',
      });
    }

    const schedGap = scheduledCov.missingSnapshot + scheduledCov.missingOdds;
    if (schedGap > 5) {
      todos.push({
        id: 'scheduled-gap',
        severity: 'warning',
        title: `未来 10 天有 ${schedGap} 项未开赛数据缺口`,
        description: '建议运行补未开赛',
        actionLabel: '补未开赛',
        actionRoute: '/ops/daily/morning',
        actionType: 'navigate',
        completionMode: 'auto',
      });
    }

    if (draftReports > 0) {
      todos.push({
        id: 'ai-draft',
        severity: 'info',
        title: `${draftReports} 篇 AI 待审核`,
        description: '发布后 C 端才可见',
        actionLabel: '去 AI 审核发布',
        actionRoute: '/ai-reports',
        actionType: 'review',
        completionMode: 'auto',
      });
    }

    const afAuthFail = await this.prisma.apiLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 3600_000) },
        OR: [
          { provider: 'api-football', statusCode: { in: [401, 403] } },
          { endpoint: { contains: 'api-football' }, statusCode: { in: [401, 403] } },
        ],
      },
    });
    if (afAuthFail > 0) {
      todos.push({
        id: 'af-auth-error',
        severity: 'critical',
        title: 'AF API 凭证可能无效（近期 401/403）',
        description: `近 1 小时 ${afAuthFail} 次鉴权失败`,
        actionLabel: '检查工具页',
        actionRoute: '/tools',
        actionType: 'navigate',
        completionMode: 'auto',
      });
    }

    const remainingRatio = quota.limit > 0 ? quota.remaining / quota.limit : 1;
    if (remainingRatio < 0.2) {
      todos.push({
        id: 'af-quota',
        severity: 'critical',
        title: `AF API 配额剩余不足 20%（${quota.remaining}/${quota.limit}）`,
        description: '请减少批量同步或明日再试',
        actionLabel: '查看配额',
        actionRoute: '/tools',
        actionType: 'navigate',
        completionMode: 'auto',
      });
    }

    if (partialJob) {
      todos.push({
        id: `partial-job-${partialJob.id}`,
        severity: 'warning',
        title: '最近任务部分失败',
        description: partialJob.bundleId ?? partialJob.kind,
        actionLabel: '查看失败场次',
        actionRoute: `/jobs/${partialJob.id}`,
        actionType: 'navigate',
        completionMode: 'auto',
        meta: { jobId: partialJob.id },
      });
    }

    if (paidOrphans > 0) {
      todos.push({
        id: 'paid-no-unlock',
        severity: 'critical',
        title: `${paidOrphans} 笔已支付订单未发放解锁`,
        description: '请检查用户与订单',
        actionLabel: '查看订单',
        actionRoute: '/users-orders',
        actionType: 'navigate',
        completionMode: 'auto',
      });
    }

    todos.push({
      id: 'manual-spot-check',
      severity: 'info',
      title: '今日建议抽查 1 场用户页面',
      description: '打开比赛工作台预览 C 端 detail',
      actionLabel: '打开比赛中心',
      actionRoute: '/matches',
      actionType: 'navigate',
      completionMode: 'manual',
    });

    return todos;
  }

  private async findPaidOrdersWithoutUnlock(): Promise<number> {
    const paid = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAID,
        matchId: { not: null },
        product: { in: ['REPORT_UNLOCK', 'FEATURED_REPORT_UNLOCK'] },
      },
      select: { id: true, userId: true, matchId: true },
      take: 200,
    });
    let orphans = 0;
    for (const o of paid) {
      if (!o.matchId) continue;
      const unlock = await this.prisma.paymentUnlock.findFirst({
        where: {
          userId: o.userId,
          matchId: o.matchId,
          status: OrderStatus.PAID,
        },
      });
      if (!unlock) orphans++;
    }
    return orphans;
  }

  async getRecentIncidents(): Promise<RecentIncident[]> {
    const out: RecentIncident[] = [];
    const [failedJobs, quota, failedItems] = await Promise.all([
      this.prisma.ingestJobRun.findMany({
        where: { status: { in: ['FAILED', 'PARTIAL_SUCCESS'] } },
        orderBy: { startedAt: 'desc' },
        take: 3,
      }),
      this.afQuota.snapshot(),
      this.prisma.ingestJobItem.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

    for (const j of failedJobs) {
      out.push({
        id: `job-${j.id}`,
        severity: j.status === 'FAILED' ? 'critical' : 'warning',
        title: `任务 ${j.bundleId ?? j.kind} ${j.status}`,
        createdAt: j.startedAt.toISOString(),
        route: `/jobs/${j.id}`,
      });
    }

    if (quota.limit > 0 && quota.remaining / quota.limit < 0.2) {
      out.push({
        id: 'quota-warn',
        severity: 'warning',
        title: `AF 配额 ${quota.used}/${quota.limit}`,
        createdAt: new Date().toISOString(),
        route: '/tools',
      });
    }

    for (const item of failedItems) {
      out.push({
        id: `item-${item.id}`,
        severity: 'warning',
        title: item.errorMessage?.slice(0, 80) ?? '场次同步失败',
        createdAt: item.updatedAt.toISOString(),
        route: item.matchId ? `/matches/${item.matchId}` : '/jobs',
      });
    }

    return out.slice(0, 8);
  }

  private async latestJobForBundle(
    bundleId: string,
  ): Promise<{ status: StepStatus; jobId?: string; finishedAt?: string }> {
    const job = await this.prisma.ingestJobRun.findFirst({
      where: { bundleId },
      orderBy: { startedAt: 'desc' },
    });
    if (!job) return { status: 'NOT_STARTED' };
    if (!TERMINAL_JOB.has(job.status)) {
      return { status: 'RUNNING', jobId: job.id };
    }
    const st =
      job.status === 'SUCCEEDED'
        ? 'SUCCESS'
        : (job.status as StepStatus);
    return {
      status: st,
      jobId: job.id,
      finishedAt: job.finishedAt?.toISOString(),
    };
  }

  async getBootstrapStatus(): Promise<BootstrapStatusResponse> {
    const [tournamentCount, adminCount] = await Promise.all([
      this.prisma.tournament.count(),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
    ]);
    const seedOk = tournamentCount > 0 && adminCount > 0;

    const [catalog, fullInitial, preMatch, finished, schedCov, finCov] =
      await Promise.all([
        this.latestJobForBundle('catalog'),
        this.latestJobForBundle('full_initial'),
        this.latestJobForBundle('scheduled_pre_match_bootstrap'),
        this.latestJobForBundle('finished_post_match_bootstrap'),
        this.scheduledBootstrap.coverage(10),
        this.finishedBootstrap.coverage(90),
      ]);

    const preGapRate =
      schedCov.total > 0
        ? (schedCov.missingSnapshot + schedCov.missingOdds) / schedCov.total
        : 0;
    const finCounts = (finCov as { counts?: Record<string, number> }).counts ?? {};
    const finTotal = finCounts.finishedTotal ?? 0;
    const finGapRate =
      finTotal > 0 ? Math.max(0, finTotal - (finCounts.withFacts ?? 0)) / finTotal : 0;

    const preStatus = this.resolveBootstrapStep(preMatch, preGapRate < 0.15);
    const finishedStatus = this.resolveBootstrapStep(finished, finGapRate < 0.15);

    const steps: BootstrapStatusResponse['steps'] = [
      { key: 'seed', status: seedOk ? 'SUCCESS' : 'NOT_STARTED' },
      { key: 'catalog', status: catalog.status, jobId: catalog.jobId },
      {
        key: 'full_initial',
        status: fullInitial.status,
        jobId: fullInitial.jobId,
        finishedAt: fullInitial.finishedAt,
      },
      { key: 'pre_match', status: preStatus, jobId: preMatch.jobId },
      { key: 'finished', status: finishedStatus, jobId: finished.jobId },
    ];

    const anyRunning = steps.some((s) => s.status === 'RUNNING');
    const anyFailed = steps.some((s) => s.status === 'FAILED');
    const anyPartial = steps.some((s) => s.status === 'PARTIAL_SUCCESS');
    const coreDone =
      fullInitial.status === 'SUCCESS' &&
      catalog.status === 'SUCCESS' &&
      seedOk;

    let bootstrapStatus: BootstrapStatusResponse['bootstrapStatus'] =
      'NOT_STARTED';
    if (anyRunning) bootstrapStatus = 'RUNNING';
    else if (anyFailed) bootstrapStatus = 'NEEDS_REPAIR';
    else if (anyPartial) bootstrapStatus = 'PARTIAL_SUCCESS';
    else if (
      coreDone &&
      preMatch.status === 'SUCCESS' &&
      finished.status === 'SUCCESS'
    ) {
      bootstrapStatus = 'COMPLETED';
    } else if (coreDone) bootstrapStatus = 'PARTIAL_SUCCESS';

    return {
      bootstrapStatus,
      steps,
      lastFullInitial: fullInitial.finishedAt
        ? { jobId: fullInitial.jobId, finishedAt: fullInitial.finishedAt }
        : null,
    };
  }

  private resolveBootstrapStep(
    job: { status: StepStatus; jobId?: string },
    coverageOk: boolean,
  ): StepStatus {
    if (job.status === 'RUNNING') return 'RUNNING';
    if (job.status === 'FAILED' || job.status === 'PARTIAL_SUCCESS') return job.status;
    if (job.status === 'SUCCESS' && coverageOk) return 'SUCCESS';
    if (job.status === 'SUCCESS' && !coverageOk) return 'NEEDS_REPAIR';
    return job.status;
  }

  async getDailySummary(tab: string): Promise<DailySummaryResponse> {
    const lines: string[] = [];
    const today = this.startOfToday();
    const tomorrow = this.endOfToday();

    if (tab === 'morning' || !tab) {
      const [todayMatches, sched, quota, drafts, failedJob] = await Promise.all([
        this.prisma.match.count({
          where: { kickoffTime: { gte: today, lt: tomorrow } },
        }),
        this.scheduledBootstrap.coverage(10),
        this.afQuota.snapshot(),
        this.prisma.aiReport.count({
          where: { status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] } },
        }),
        this.prisma.ingestJobRun.findFirst({
          where: { status: 'FAILED' },
          orderBy: { startedAt: 'desc' },
        }),
      ]);
      lines.push(`今日开球：${todayMatches} 场`);
      lines.push(
        `未来 10 天未开赛缺口：快照 ${sched.missingSnapshot} · 赔率 ${sched.missingOdds}`,
      );
      lines.push(
        `API 配额剩余：${quota.remaining}/${quota.limit}（${Math.round((quota.remaining / Math.max(1, quota.limit)) * 100)}%）`,
      );
      lines.push(`待发布 AI：${drafts} 篇`);
      lines.push(`最近任务失败：${failedJob ? 1 : 0} 个`);
    } else if (tab === 'matchday') {
      const [live, cov] = await Promise.all([
        this.prisma.match.count({ where: { status: MatchStatus.LIVE } }),
        this.liveCoverage.coverage(30),
      ]);
      const items =
        (cov as { items?: Array<{ hasEvents?: boolean }> }).items ?? [];
      const missingEvents = items.filter((i) => !i.hasEvents).length;
      lines.push(`LIVE 进行中：${live} 场`);
      lines.push(`比分/事件缺失：${missingEvents} 场`);
    } else if (tab === 'postmatch') {
      const fin = await this.finishedBootstrap.coverage(90);
      const fc = (fin as { counts?: Record<string, number> }).counts ?? {};
      const finTotal = fc.finishedTotal ?? 0;
      const incomplete = Math.max(0, finTotal - (fc.withFacts ?? 0));
      const drafts = await this.prisma.aiReport.count({
        where: {
          reportType: 'POST_MATCH',
          status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] },
        },
      });
      lines.push(`近 90 天已结束未补全约：${incomplete}/${finTotal} 场`);
      lines.push(`待审核赛后 AI：${drafts} 篇`);
    }

    return { tab: tab || 'morning', lines };
  }
}
