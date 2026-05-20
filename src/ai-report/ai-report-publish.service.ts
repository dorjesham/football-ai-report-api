import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AiReportType, ReportStatus } from '@prisma/client';
import { validateReportBeforePublish } from '../common/utils/content-safety';
import { PrismaService } from '../prisma/prisma.service';
import { WorldCupCoverageService } from '../world-cup/world-cup-coverage.service';
import { MatchIntelFreshnessService } from '../match-intel/match-intel-freshness.service';

export type PublishAiReportResult = {
  published: boolean;
  skipped?: string;
  reportId?: string;
};

@Injectable()
export class AiReportPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worldCupCoverage: WorldCupCoverageService,
    private readonly freshness: MatchIntelFreshnessService,
  ) {}

  publishedKeyFor(matchId: string, reportType: AiReportType): string {
    return `${matchId}:${reportType}`;
  }

  async publishById(
    reportId: string,
    opts?: { forcedPublish?: boolean; reason?: string; userId?: string },
  ): Promise<PublishAiReportResult> {
    const report = await this.prisma.aiReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('AiReport not found');
    return this.publishReport(report, opts);
  }

  async publishPostMatchForBootstrap(matchId: string): Promise<PublishAiReportResult> {
    const existingPublished = await this.prisma.aiReport.findFirst({
      where: {
        matchId,
        reportType: AiReportType.POST_MATCH,
        status: ReportStatus.PUBLISHED,
      },
      select: { id: true },
    });
    if (existingPublished) {
      return { published: true, skipped: 'already_visible', reportId: existingPublished.id };
    }

    const draft = await this.prisma.aiReport.findFirst({
      where: {
        matchId,
        reportType: AiReportType.POST_MATCH,
        status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      return { published: false, skipped: 'no_report' };
    }
    return this.publishReport(draft);
  }

  private async publishReport(
    report: {
      id: string;
      matchId: string;
      reportType: AiReportType;
      disclaimer: string;
      freeSummary: string;
      status: ReportStatus;
      isStale?: boolean;
    },
    opts?: { forcedPublish?: boolean; reason?: string; userId?: string },
  ): Promise<PublishAiReportResult> {
    if (report.status === ReportStatus.PUBLISHED) {
      return { published: true, skipped: 'already_published', reportId: report.id };
    }
    if (report.status === ReportStatus.ARCHIVED) {
      throw new BadRequestException('Cannot publish archived report');
    }

    const safety = validateReportBeforePublish({
      disclaimer: report.disclaimer,
      freeSummary: report.freeSummary,
    });
    if (!safety.ok) {
      return {
        published: false,
        skipped: safety.reasons.join(','),
        reportId: report.id,
      };
    }

    if (report.isStale === true) {
      throw new UnprocessableEntityException({
        code: 'AI_REPORT_STALE',
        message: 'Report is stale; reconcile match data before publish',
      });
    }

    const isWc = await this.worldCupCoverage.isWorldCupMatchId(report.matchId);
    const forced = opts?.forcedPublish === true;
    if (isWc && report.reportType === AiReportType.PRE_MATCH && !forced) {
      const gate = await this.worldCupCoverage.evaluatePublishGate(report.matchId);
      if (!gate.aiPublishable) {
        throw new UnprocessableEntityException({
          code: 'WC_AI_PUBLISH_GATE_FAILED',
          reasons: gate.reasons,
        });
      }
    }
    if (forced && (!opts?.reason?.trim() || !opts.userId)) {
      throw new BadRequestException('forcedPublish requires reason and userId');
    }

    const intelHash = await this.freshness.computeIntelContentHash(report.matchId);
    const publishedKey = this.publishedKeyFor(report.matchId, report.reportType);

    await this.prisma.$transaction(async (tx) => {
      await tx.aiReport.updateMany({
        where: {
          matchId: report.matchId,
          reportType: report.reportType,
          status: ReportStatus.PUBLISHED,
          id: { not: report.id },
        },
        data: {
          status: ReportStatus.ARCHIVED,
          publishedKey: null,
        },
      });

      await tx.aiReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedKey,
          sourceIntelHash: intelHash,
          isStale: false,
          staleReason: null,
          staleDetectedAt: null,
          forcedPublish: forced,
          forcedPublishReason: forced ? opts?.reason?.trim() ?? null : null,
          forcedPublishByUserId: forced ? opts?.userId ?? null : null,
        },
      });
      await tx.match.update({
        where: { id: report.matchId },
        data: {
          intelContentHash: intelHash,
          intelContentHashAt: new Date(),
        },
      });
    });

    return { published: true, reportId: report.id };
  }

  async archiveById(reportId: string): Promise<{ archived: boolean; reportId: string }> {
    const report = await this.prisma.aiReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('AiReport not found');
    if (report.status !== ReportStatus.PUBLISHED) {
      throw new BadRequestException('Only PUBLISHED reports can be archived');
    }
    await this.prisma.aiReport.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.ARCHIVED,
        publishedKey: null,
      },
    });
    return { archived: true, reportId };
  }
}
