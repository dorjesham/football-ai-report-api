import { Injectable } from '@nestjs/common';
import { MatchStatus, ReportStatus } from '@prisma/client';
import type { AfAvailabilityStatus } from '../match-af-raw-bundle/af-availability.util';
import { MatchAfRawBundleService } from '../match-af-raw-bundle/match-af-raw-bundle.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type CoverageHealth = 'green' | 'yellow' | 'red';

@Injectable()
export class AdminMatchesListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleSvc: MatchAfRawBundleService,
    private readonly redis: RedisService,
  ) {}

  private coverageHealthFromBundle(bundle: {
    availabilityJson: unknown;
    [key: string]: unknown;
  } | null): CoverageHealth {
    if (!bundle) return 'red';
    const cov = this.bundleSvc.buildCoverage(
      bundle as Parameters<MatchAfRawBundleService['buildCoverage']>[0],
    );
    const statuses = Object.values(cov).map(
      (r) => (r as { status?: AfAvailabilityStatus }).status ?? 'missing',
    );
    const bad = statuses.filter((s) => s === 'missing' || s === 'error').length;
    if (bad === 0) return 'green';
    if (bad <= 2) return 'yellow';
    return 'red';
  }

  async opsList(opts: {
    status?: string;
    kickoffFrom?: string;
    kickoffTo?: string;
    competitionCode?: string;
    coverageHealth?: CoverageHealth;
    aiStatus?: 'none' | 'draft' | 'published' | 'failed';
    hasFailedJob?: boolean;
    take?: number;
  }) {
    const take = Math.min(250, opts.take ?? 100);
    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status as MatchStatus;
    if (opts.competitionCode) {
      where.competition = { code: opts.competitionCode };
    }
    if (opts.kickoffFrom || opts.kickoffTo) {
      where.kickoffTime = {
        ...(opts.kickoffFrom ? { gte: new Date(opts.kickoffFrom) } : {}),
        ...(opts.kickoffTo ? { lte: new Date(opts.kickoffTo) } : {}),
      };
    }

    const matches = await this.prisma.match.findMany({
      where,
      include: {
        homeTeam: { select: { nameCn: true } },
        awayTeam: { select: { nameCn: true } },
        competition: { select: { code: true, nameCn: true } },
        afRawBundle: true,
      },
      orderBy: { kickoffTime: 'asc' },
      take: take * 2,
    });

    const matchIds = matches.map((m) => m.id);
    const [reports, failedItems] = await Promise.all([
      this.prisma.aiReport.findMany({
        where: { matchId: { in: matchIds } },
        orderBy: { updatedAt: 'desc' },
        select: {
          matchId: true,
          reportType: true,
          status: true,
          contentWarnings: true,
        },
      }),
      opts.hasFailedJob
        ? this.prisma.ingestJobItem.findMany({
            where: { matchId: { in: matchIds }, status: 'FAILED' },
            select: { matchId: true },
            distinct: ['matchId'],
          })
        : Promise.resolve([]),
    ]);

    const failedSet = new Set(
      failedItems.map((i) => i.matchId).filter(Boolean) as string[],
    );
    const byMatch = new Map<
      string,
      { pre?: (typeof reports)[0]; post?: (typeof reports)[0] }
    >();
    for (const r of reports) {
      const cur = byMatch.get(r.matchId) ?? {};
      if (r.reportType === 'PRE_MATCH' && !cur.pre) cur.pre = r;
      if (r.reportType === 'POST_MATCH' && !cur.post) cur.post = r;
      byMatch.set(r.matchId, cur);
    }

    const rows = [];
    for (const m of matches) {
      const coverageHealth = this.coverageHealthFromBundle(m.afRawBundle);
      if (opts.coverageHealth && coverageHealth !== opts.coverageHealth) continue;

      const ai = byMatch.get(m.id);
      const aiSummary = this.summarizeAi(ai?.pre, ai?.post);
      if (opts.aiStatus && aiSummary !== opts.aiStatus) continue;
      if (opts.hasFailedJob === true && !failedSet.has(m.id)) continue;
      if (opts.hasFailedJob === false && failedSet.has(m.id)) continue;

      const generating =
        (await this.redis.getString(`ai:generating:${m.id}:PRE_MATCH`)) != null ||
        (await this.redis.getString(`ai:generating:${m.id}:POST_MATCH`)) != null;

      rows.push({
        id: m.id,
        kickoffTime: m.kickoffTime.toISOString(),
        status: m.status,
        homeTeamName: m.homeTeam.nameCn,
        awayTeamName: m.awayTeam.nameCn,
        competitionCode: m.competition?.code ?? null,
        coverageHealth,
        aiPreStatus: ai?.pre?.status ?? null,
        aiPostStatus: ai?.post?.status ?? null,
        aiSummary,
        displayStatusPre: generating && !ai?.pre?.status ? 'GENERATING' : ai?.pre?.status,
        displayStatusPost: generating && !ai?.post?.status ? 'GENERATING' : ai?.post?.status,
        hasFailedJob: failedSet.has(m.id),
      });
      if (rows.length >= take) break;
    }

    return { items: rows, total: rows.length };
  }

  private summarizeAi(
    pre?: { status: ReportStatus; contentWarnings: unknown },
    post?: { status: ReportStatus; contentWarnings: unknown },
  ): 'none' | 'draft' | 'published' | 'failed' {
    const list = [pre, post].filter(Boolean) as Array<{
      status: ReportStatus;
      contentWarnings: unknown;
    }>;
    if (!list.length) return 'none';
    if (list.some((r) => r.status === ReportStatus.PUBLISHED)) return 'published';
    const hasWarn =
      list.some(
        (r) =>
          Array.isArray(r.contentWarnings) && (r.contentWarnings as unknown[]).length > 0,
      ) || list.some((r) => r.status === ReportStatus.DRAFT && r.contentWarnings);
    if (hasWarn) return 'failed';
    if (
      list.some(
        (r) => r.status === ReportStatus.DRAFT || r.status === ReportStatus.REVIEW,
      )
    ) {
      return 'draft';
    }
    return 'none';
  }
}
