import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseMatchEventsStorage } from '../match-live/match-events-storage.util';
import { keyMetricsFromAfTeamStats } from '../match-live/live-key-metrics.util';
import {
  FactCheckResult,
  FactCheckResultSchema,
  LiveNarrativeStructuredV1Schema,
  PostMatchStructuredV1Schema,
  SourcePointer,
} from './schemas/structured-report.schema';
import type { AiReport } from '@prisma/client';

@Injectable()
export class ReportFactCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async checkReport(report: AiReport): Promise<FactCheckResult> {
    const errors: FactCheckResult['errors'] = [];
    const match = await this.prisma.match.findUnique({
      where: { id: report.matchId },
      include: { matchFacts: true },
    });
    if (!match) {
      return FactCheckResultSchema.parse({
        pass: false,
        checkedAt: new Date().toISOString(),
        errors: [{ code: 'MATCH_NOT_FOUND', message: 'Match missing' }],
      });
    }

    const facts = match.matchFacts;
    const events = parseMatchEventsStorage(facts?.events ?? null).items;
    const eventIds = new Set(events.map((e) => e.id));
    const km = keyMetricsFromAfTeamStats(
      (facts?.teamStats as { apiFootball?: unknown })?.apiFootball ?? facts?.teamStats,
    );

    const structured = report.structuredContentJson;
    if (structured) {
      const parsed =
        (structured as { schema?: string }).schema === 'live-narrative-v1'
          ? LiveNarrativeStructuredV1Schema.safeParse(structured)
          : PostMatchStructuredV1Schema.safeParse(structured);
      if (!parsed.success) {
        errors.push({
          code: 'STRUCTURED_INVALID',
          message: parsed.error.message.slice(0, 200),
        });
      } else {
        const claims =
          parsed.data.schema === 'live-narrative-v1'
            ? [
                parsed.data.summary,
                ...parsed.data.timeline.map((t) => ({ text: t.line, pointers: t.pointers })),
              ]
            : [
                ...parsed.data.recap,
                ...parsed.data.turningPoints,
                ...parsed.data.motm.rationale,
                ...parsed.data.keyPlayers.flatMap((p) => p.highlights),
                ...(parsed.data.predictionReview ?? []),
              ];
        for (const c of claims) {
          for (const p of c.pointers) {
            const err = this.resolvePointer(p, {
              eventIds,
              km,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              htHome: facts?.htHome,
              htAway: facts?.htAway,
              ftHome: facts?.ftHome,
              ftAway: facts?.ftAway,
              predictionId: report.predictionId,
            });
            if (err) errors.push({ ...err, pointer: p });
          }
        }
      }
    }

    const scoreMatch = report.freeSummary.match(/(\d+)\s*[-:：]\s*(\d+)/);
    if (scoreMatch && match.homeScore != null && match.awayScore != null) {
      const a = Number(scoreMatch[1]);
      const b = Number(scoreMatch[2]);
      if (a !== match.homeScore || b !== match.awayScore) {
        errors.push({
          code: 'SCORE_MISMATCH',
          message: `Narrative score ${a}-${b} vs DB ${match.homeScore}-${match.awayScore}`,
        });
      }
    }

    return FactCheckResultSchema.parse({
      pass: errors.length === 0,
      checkedAt: new Date().toISOString(),
      errors,
    });
  }

  private resolvePointer(
    p: SourcePointer,
    ctx: {
      eventIds: Set<string>;
      km: ReturnType<typeof keyMetricsFromAfTeamStats>;
      homeScore: number | null;
      awayScore: number | null;
      htHome: number | null | undefined;
      htAway: number | null | undefined;
      ftHome: number | null | undefined;
      ftAway: number | null | undefined;
      predictionId: string | null;
    },
  ): { code: string; message: string } | null {
    switch (p.kind) {
      case 'live_event':
        if (!ctx.eventIds.has(p.eventId)) {
          return { code: 'EVENT_MISSING', message: `Event ${p.eventId} not in facts` };
        }
        return null;
      case 'stat': {
        const side = ctx.km?.[p.side];
        if (!side || !(p.key in side)) {
          return { code: 'STAT_MISSING', message: `Stat ${p.side}.${p.key} unavailable` };
        }
        return null;
      }
      case 'score':
        if (p.field === 'match') {
          if (ctx.homeScore == null || ctx.awayScore == null) {
            return { code: 'SCORE_MISSING', message: 'Match score not set' };
          }
        }
        if (p.field === 'ht' && (ctx.htHome == null || ctx.htAway == null)) {
          return { code: 'HT_MISSING', message: 'Half-time score missing' };
        }
        return null;
      case 'prediction':
        if (ctx.predictionId && p.predictionId !== ctx.predictionId) {
          return { code: 'PREDICTION_BIND', message: 'Prediction pointer mismatch' };
        }
        return null;
      case 'grading':
        return null;
      default:
        return null;
    }
  }
}
