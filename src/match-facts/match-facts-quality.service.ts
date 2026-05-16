import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assessMatchFactsQuality,
  buildValidationLogEntry,
} from './match-facts-quality.util';
import { parseSupplementaryFacts } from './supplementary-facts.util';

@Injectable()
export class MatchFactsQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async validateMatchFacts(matchId: string, opts?: { appendLog?: boolean }) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { matchFacts: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    const issues = assessMatchFactsQuality({
      matchId: match.id,
      status: match.status,
      kickoffTime: match.kickoffTime,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      facts: match.matchFacts,
    });

    const logEntry = buildValidationLogEntry(issues);
    const pass = logEntry.pass as boolean;

    if (opts?.appendLog !== false && match.matchFacts) {
      const prev = Array.isArray(match.matchFacts.validationLog)
        ? (match.matchFacts.validationLog as unknown[])
        : match.matchFacts.validationLog
          ? [match.matchFacts.validationLog]
          : [];
      await this.prisma.matchFacts.update({
        where: { matchId },
        data: {
          validatedAt: pass ? new Date() : match.matchFacts.validatedAt,
          validationLog: [...prev, logEntry] as Prisma.InputJsonValue,
        },
      });
    }

    return { matchId, pass, issues, logEntry };
  }

  async listAnomalies(opts?: {
    status?: MatchStatus;
    lookbackDays?: number;
    max?: number;
  }) {
    const lookback = opts?.lookbackDays ?? 14;
    const max = Math.min(200, opts?.max ?? 50);
    const since = new Date(Date.now() - lookback * 86400_000);

    const matches = await this.prisma.match.findMany({
      where: {
        kickoffTime: { gte: since },
        status: opts?.status,
      },
      include: { matchFacts: true },
      orderBy: { kickoffTime: 'desc' },
      take: max * 4,
    });

    const anomalies: Array<{
      matchId: string;
      status: string;
      kickoffTime: string;
      issues: ReturnType<typeof assessMatchFactsQuality>;
    }> = [];

    for (const m of matches) {
      const issues = assessMatchFactsQuality({
        matchId: m.id,
        status: m.status,
        kickoffTime: m.kickoffTime,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        facts: m.matchFacts,
      });
      if (issues.length > 0) {
        anomalies.push({
          matchId: m.id,
          status: m.status,
          kickoffTime: m.kickoffTime.toISOString(),
          issues,
        });
        if (anomalies.length >= max) break;
      }
    }

    return { lookbackDays: lookback, sample: anomalies.length, anomalies };
  }

  async qualitySummary(opts?: { lookbackDays?: number }) {
    const lookback = opts?.lookbackDays ?? 30;
    const since = new Date(Date.now() - lookback * 86400_000);

    const finished = await this.prisma.match.count({
      where: { status: MatchStatus.FINISHED, kickoffTime: { gte: since } },
    });
    const withFacts = await this.prisma.match.count({
      where: {
        status: MatchStatus.FINISHED,
        kickoffTime: { gte: since },
        matchFacts: { isNot: null },
      },
    });
    const validated = await this.prisma.match.count({
      where: {
        status: MatchStatus.FINISHED,
        kickoffTime: { gte: since },
        matchFacts: { validatedAt: { not: null } },
      },
    });
    const withEvents = await this.prisma.match.count({
      where: {
        status: MatchStatus.FINISHED,
        kickoffTime: { gte: since },
        matchFacts: { events: { not: Prisma.DbNull } },
      },
    });
    const withStats = await this.prisma.match.count({
      where: {
        status: MatchStatus.FINISHED,
        kickoffTime: { gte: since },
        matchFacts: { teamStats: { not: Prisma.DbNull } },
      },
    });
    const withSupplementary = await this.prisma.match.count({
      where: {
        kickoffTime: { gte: since },
        matchFacts: { supplementaryFacts: { not: Prisma.DbNull } },
      },
    });

    return {
      lookbackDays: lookback,
      finished,
      withFacts,
      validated,
      withEvents,
      withStats,
      withSupplementary,
      rates: {
        factsRow: finished ? withFacts / finished : null,
        validated: withFacts ? validated / withFacts : null,
        events: withFacts ? withEvents / withFacts : null,
        teamStats: withFacts ? withStats / withFacts : null,
      },
    };
  }

  async getSupplementary(matchId: string) {
    const facts = await this.prisma.matchFacts.findUnique({
      where: { matchId },
    });
    if (!facts) throw new NotFoundException('MatchFacts not found');
    return {
      matchId,
      primaryProvider: facts.primaryProvider,
      structureProvider: facts.structureProvider,
      supplementary: parseSupplementaryFacts(facts.supplementaryFacts),
    };
  }
}
