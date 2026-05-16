import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiReportType, MatchStatus, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiReportReviewService } from './ai-report-review.service';
import { LiveNarrativeReportService } from './live-narrative-report.service';
import { PostMatchReportService } from './post-match-report.service';

@Injectable()
export class AutoPostMatchReportBatchService {
  private readonly log = new Logger(AutoPostMatchReportBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly postMatch: PostMatchReportService,
    private readonly liveNarrative: LiveNarrativeReportService,
    private readonly review: AiReportReviewService,
  ) {}

  async runScheduledTick(): Promise<{
    attempted: number;
    postMatchCreated: number;
    liveNarrativeCreated: number;
    submittedReview: number;
    errors: string[];
  }> {
    const max = this.config.get<number>('postMatchReportMaxPerTick') ?? 6;
    const lookbackH = this.config.get<number>('postMatchReportLookbackHours') ?? 24;
    const since = new Date(Date.now() - lookbackH * 3600_000);
    const enableLive = this.config.get<boolean>('enableLiveNarrativeCron') === true;

    const candidates = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.FINISHED,
        kickoffTime: { gte: since },
        matchFacts: { isNot: null },
      },
      select: { id: true },
      take: max * 3,
      orderBy: { kickoffTime: 'desc' },
    });

    let attempted = 0;
    let postMatchCreated = 0;
    let liveNarrativeCreated = 0;
    let submittedReview = 0;
    const errors: string[] = [];

    for (const { id: matchId } of candidates) {
      if (postMatchCreated >= max) break;

      const existingPost = await this.prisma.aiReport.findFirst({
        where: {
          matchId,
          reportType: AiReportType.POST_MATCH,
          status: {
            in: [ReportStatus.DRAFT, ReportStatus.REVIEW, ReportStatus.PUBLISHED],
          },
        },
      });
      if (existingPost) continue;

      attempted++;
      try {
        const report = await this.postMatch.generatePostMatch(matchId);
        postMatchCreated++;
        const reviewed = await this.review.submitForReview(matchId, report.id);
        if (reviewed.status === ReportStatus.REVIEW) submittedReview++;

        if (enableLive) {
          const existingLive = await this.prisma.aiReport.findFirst({
            where: {
              matchId,
              reportType: AiReportType.LIVE_NARRATIVE,
              status: {
                in: [ReportStatus.DRAFT, ReportStatus.REVIEW, ReportStatus.PUBLISHED],
              },
            },
          });
          if (!existingLive) {
            const ln = await this.liveNarrative.generateLiveNarrative(matchId);
            liveNarrativeCreated++;
            await this.review.submitForReview(matchId, ln.id);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${matchId}: ${msg}`);
        this.log.warn(`post-match batch ${matchId}: ${msg}`);
      }
    }

    return {
      attempted,
      postMatchCreated,
      liveNarrativeCreated,
      submittedReview,
      errors,
    };
  }
}
