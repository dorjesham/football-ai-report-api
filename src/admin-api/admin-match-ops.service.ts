import { Injectable, NotFoundException } from '@nestjs/common';
import { AiReportType, ReportStatus } from '@prisma/client';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { extractAfTeamComparison } from '../match-af-raw-bundle/af-predictions-comparison.util';
import { MatchAfRawBundleService } from '../match-af-raw-bundle/match-af-raw-bundle.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminMatchOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly bundleSvc: MatchAfRawBundleService,
  ) {}

  async getOpsStatus(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { id: true, nameCn: true, externalId: true } },
        awayTeam: { select: { id: true, nameCn: true, externalId: true } },
        competition: { select: { code: true, nameCn: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const [bundle, coverage, aiReports, recentJobItems, recentJobs] =
      await Promise.all([
        this.bundleSvc.getByMatchId(matchId),
        this.afSync.getCoverage(matchId),
        this.prisma.aiReport.findMany({
          where: { matchId },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            reportType: true,
            status: true,
            publishedAt: true,
            publishedKey: true,
            inputHash: true,
            freeSummary: true,
            updatedAt: true,
            createdAt: true,
          },
        }),
        this.prisma.ingestJobItem.findMany({
          where: { matchId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            job: {
              select: {
                id: true,
                bundleId: true,
                kind: true,
                status: true,
                startedAt: true,
              },
            },
          },
        }),
        this.prisma.ingestJobRun.findMany({
          where: { items: { some: { matchId } } },
          orderBy: { startedAt: 'desc' },
          take: 5,
        }),
      ]);

    const latestByType = (type: AiReportType) => {
      const rows = aiReports.filter((r) => r.reportType === type);
      const published = rows.find((r) => r.status === ReportStatus.PUBLISHED);
      const draft = rows.find(
        (r) =>
          r.status === ReportStatus.DRAFT || r.status === ReportStatus.REVIEW,
      );
      return { published, draft, latest: rows[0] ?? null };
    };

    const afComparison = extractAfTeamComparison(bundle?.predictionsJson ?? null);

    return {
      match: {
        id: match.id,
        status: match.status,
        kickoffTime: match.kickoffTime,
        externalId: match.externalId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        competition: match.competition,
      },
      afBundle: {
        syncedAt: bundle?.syncedAt ?? null,
        coverage,
      },
      aiDataSignals: {
        predictionsPresent: bundle?.predictionsJson != null,
        afComparisonPresent: afComparison.available,
      },
      aiReports: {
        preMatch: latestByType(AiReportType.PRE_MATCH),
        postMatch: latestByType(AiReportType.POST_MATCH),
        all: aiReports,
      },
      ingest: {
        recentJobItems,
        recentJobs,
      },
      recommendedActions: this.recommendedActions(match.status, coverage),
    };
  }

  private recommendedActions(
    status: string,
    coverage: Record<string, unknown>,
  ): string[] {
    const actions: string[] = [];
    if (status === 'SCHEDULED') {
      actions.push('sync-full');
    }
    if (status === 'LIVE') {
      actions.push('sync-live-facts');
    }
    if (status === 'FINISHED') {
      actions.push('finished_post_match_bootstrap');
    }
    const cov = coverage as { fixture?: string };
    if (cov.fixture === 'missing') {
      actions.unshift('sync-full');
    }
    return actions;
  }
}
