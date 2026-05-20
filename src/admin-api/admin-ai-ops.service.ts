import { Injectable } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminAiOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listOpsReports(tab: 'all' | 'draft' | 'published' | 'failed', take = 50) {
    const limit = Math.min(100, take);
    if (tab === 'failed') {
      return this.listFailed(limit);
    }
    const statusFilter =
      tab === 'draft'
        ? { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] as ReportStatus[] }
        : tab === 'published'
          ? ReportStatus.PUBLISHED
          : undefined;

    const rows = await this.prisma.aiReport.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        matchId: true,
        reportType: true,
        status: true,
        publishedAt: true,
        contentWarnings: true,
        updatedAt: true,
      },
    });
    return Promise.all(rows.map((r) => this.enrichRow(r)));
  }

  private async listFailed(limit: number) {
    const rows = await this.prisma.aiReport.findMany({
      where: {
        status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 3,
      select: {
        id: true,
        matchId: true,
        reportType: true,
        status: true,
        publishedAt: true,
        contentWarnings: true,
        updatedAt: true,
      },
    });

    const out = [];
    for (const r of rows) {
      const warnings = Array.isArray(r.contentWarnings)
        ? (r.contentWarnings as unknown[])
        : [];
      const jobFail = await this.prisma.ingestJobItem.findFirst({
        where: {
          matchId: r.matchId,
          status: 'FAILED',
          OR: [
            { currentStep: { contains: 'ai' } },
            { errorMessage: { contains: 'AI' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (warnings.length === 0 && !jobFail) continue;
      const enriched = await this.enrichRow(r);
      out.push({
        ...enriched,
        failureReason:
          warnings.length > 0
            ? `内容校验警告 ${warnings.length} 条`
            : jobFail?.errorMessage?.slice(0, 120) ?? '关联任务 AI 步骤失败',
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  private async enrichRow(r: {
    id: string;
    matchId: string;
    reportType: string;
    status: ReportStatus;
    contentWarnings: unknown;
    updatedAt: Date;
  }) {
    const genKey = `ai:generating:${r.matchId}:${r.reportType}`;
    const generating = (await this.redis.getString(genKey)) != null;
    let displayStatus: string = r.status;
    if (generating) displayStatus = 'GENERATING';
    else if (
      (r.status === ReportStatus.DRAFT || r.status === ReportStatus.REVIEW) &&
      (!r.contentWarnings ||
        (Array.isArray(r.contentWarnings) && r.contentWarnings.length === 0))
    ) {
      displayStatus = 'READY';
    }
    return {
      ...r,
      displayStatus,
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
