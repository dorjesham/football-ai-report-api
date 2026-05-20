import { Injectable } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import {
  type AfAvailabilityStatus,
} from '../match-af-raw-bundle/af-availability.util';
import { MatchAfRawBundleService } from '../match-af-raw-bundle/match-af-raw-bundle.service';
import { PrismaService } from '../prisma/prisma.service';

export const AF_DASHBOARD_FIELD_KEYS = [
  'fixture',
  'injuries',
  'predictions',
  'h2h',
  'lineups',
  'odds',
] as const;

export type AfDashboardFieldKey = (typeof AF_DASHBOARD_FIELD_KEYS)[number];

export type AfCoverageWindowRow = {
  matchId: string;
  kickoffTime: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionCode: string | null;
  syncedAt: string | null;
  fields: Record<AfDashboardFieldKey, AfAvailabilityStatus>;
};

@Injectable()
export class AdminAfCoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleSvc: MatchAfRawBundleService,
  ) {}

  mapCoverageToDashboardFields(
    coverage: Record<string, { status?: AfAvailabilityStatus }> | null,
  ): Record<AfDashboardFieldKey, AfAvailabilityStatus> {
    const statusOf = (key: string): AfAvailabilityStatus =>
      coverage?.[key]?.status ?? 'missing';
    return {
      fixture: statusOf('fixture'),
      injuries: statusOf('injuries'),
      predictions: statusOf('predictions'),
      h2h: statusOf('h2h'),
      lineups: statusOf('lineups'),
      odds: statusOf('oddsLatest'),
    };
  }

  async coverageWindow(opts?: {
    lookaheadHours?: number;
    take?: number;
    status?: MatchStatus;
  }) {
    const lookaheadHours = Math.min(168, Math.max(1, opts?.lookaheadHours ?? 72));
    const take = Math.min(100, Math.max(1, opts?.take ?? 50));
    const now = new Date();
    const until = new Date(now.getTime() + lookaheadHours * 3600_000);
    const status = opts?.status ?? MatchStatus.SCHEDULED;

    const matches = await this.prisma.match.findMany({
      where: {
        status,
        externalId: { startsWith: 'af-f-' },
        kickoffTime: { gte: now, lte: until },
      },
      orderBy: { kickoffTime: 'asc' },
      take,
      include: {
        homeTeam: { select: { nameCn: true } },
        awayTeam: { select: { nameCn: true } },
        competition: { select: { code: true } },
        afRawBundle: true,
      },
    });

    const fieldPresentCounts: Record<AfDashboardFieldKey, number> = {
      fixture: 0,
      injuries: 0,
      predictions: 0,
      h2h: 0,
      lineups: 0,
      odds: 0,
    };

    let withBundle = 0;
    const items: AfCoverageWindowRow[] = matches.map((m) => {
      const bundle = m.afRawBundle;
      if (bundle) withBundle++;
      const coverage =
        bundle ?
          this.bundleSvc.buildCoverage(bundle)
        : null;
      const fields = this.mapCoverageToDashboardFields(
        coverage as Record<string, { status?: AfAvailabilityStatus }> | null,
      );
      for (const key of AF_DASHBOARD_FIELD_KEYS) {
        if (fields[key] === 'present') fieldPresentCounts[key]++;
      }
      return {
        matchId: m.id,
        kickoffTime: m.kickoffTime.toISOString(),
        homeTeamName: m.homeTeam.nameCn,
        awayTeamName: m.awayTeam.nameCn,
        competitionCode: m.competition?.code ?? null,
        syncedAt: bundle?.syncedAt?.toISOString() ?? null,
        fields,
      };
    });

    const predictionsPresent =
      matches.length > 0 ? fieldPresentCounts.predictions / matches.length : 0;

    return {
      items,
      summary: {
        total: matches.length,
        withBundle,
        fieldPresentCounts,
        predictionsPresentRatio: Math.round(predictionsPresent * 1000) / 1000,
        lookaheadHours,
        status,
      },
    };
  }
}
