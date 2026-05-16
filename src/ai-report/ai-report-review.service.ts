import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiReportType, ReportStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { validateReportBeforePublish } from '../common/utils/content-safety';
import { RequestUser } from '../common/types/request-user.type';
import { ReportFactCheckService } from './report-fact-check.service';

@Injectable()
export class AiReportReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factCheck: ReportFactCheckService,
  ) {}

  async submitForReview(matchId: string, reportId: string) {
    const report = await this.prisma.aiReport.findFirst({
      where: { id: reportId, matchId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT reports can submit for review');
    }

    const check = await this.factCheck.checkReport(report);
    const warnings = Array.isArray(report.contentWarnings)
      ? [...(report.contentWarnings as string[])]
      : [];

    if (!check.pass) {
      warnings.push(...check.errors.map((e) => `fact_check:${e.code}`));
      return this.prisma.aiReport.update({
        where: { id: reportId },
        data: {
          factCheckJson: check as object,
          contentWarnings: warnings,
          status: ReportStatus.DRAFT,
        },
      });
    }

    return this.prisma.aiReport.update({
      where: { id: reportId },
      data: {
        factCheckJson: check as object,
        contentWarnings: warnings.length ? warnings : undefined,
        status: ReportStatus.REVIEW,
      },
    });
  }

  async approve(matchId: string, reportId: string, user: RequestUser) {
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Admin only');
    }
    const report = await this.prisma.aiReport.findFirst({
      where: { id: reportId, matchId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.REVIEW) {
      throw new BadRequestException('Report must be in REVIEW');
    }

    const safety = validateReportBeforePublish({
      disclaimer: report.disclaimer,
      freeSummary: report.freeSummary,
    });
    if (!safety.ok) {
      throw new BadRequestException(`无法发布: ${safety.reasons.join(',')}`);
    }

    const published = await this.prisma.aiReport.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.PUBLISHED,
        publishedAt: new Date(),
        reviewedAt: new Date(),
        reviewedByUserId: user.id,
      },
    });

    if (report.reportType === AiReportType.PRE_MATCH) {
      await this.prisma.match.update({
        where: { id: matchId },
        data: { reportStatus: ReportStatus.PUBLISHED },
      });
    }

    return published;
  }

  async reject(matchId: string, reportId: string, user: RequestUser, reason?: string) {
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Admin only');
    }
    const report = await this.prisma.aiReport.findFirst({
      where: { id: reportId, matchId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.REVIEW) {
      throw new BadRequestException('Report must be in REVIEW to reject');
    }

    const warnings = Array.isArray(report.contentWarnings)
      ? [...(report.contentWarnings as string[])]
      : [];
    if (reason) warnings.push(`rejected:${reason.slice(0, 200)}`);

    return this.prisma.aiReport.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.DRAFT,
        contentWarnings: warnings,
        reviewedAt: new Date(),
        reviewedByUserId: user.id,
      },
    });
  }
}
