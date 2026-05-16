import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';
import { extractOdds1x2Teaser } from '../api-football/af-pre-match-mapper.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  brierScore1x2,
  flatRoi1x2,
  resolveActualOutcome1x2,
  top1x2Pick,
} from './prediction-grading.util';

@Injectable()
export class PredictionGradingService {
  private readonly log = new Logger(PredictionGradingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async gradePrediction(predictionId: string) {
    const prediction = await this.prisma.matchPrediction.findUnique({
      where: { id: predictionId },
      include: {
        oddsSnapshot: true,
        match: true,
        grading: true,
      },
    });
    if (!prediction) throw new NotFoundException('Prediction not found');
    if (prediction.lockedAt == null) {
      return { skipped: true, reason: 'not_locked', predictionId };
    }
    const match = prediction.match;
    if (match.status !== MatchStatus.FINISHED) {
      return { skipped: true, reason: 'match_not_finished', predictionId };
    }
    if (match.homeScore == null || match.awayScore == null) {
      return { skipped: true, reason: 'missing_score', predictionId };
    }

    const actual = resolveActualOutcome1x2(match.homeScore, match.awayScore);
    const probs = {
      H: prediction.homeWinProbability,
      D: prediction.drawProbability,
      A: prediction.awayWinProbability,
    };
    const pick = top1x2Pick(probs);
    const hit1x2 = pick === actual;
    const brier = brierScore1x2(probs, actual);

    const teaser =
      prediction.oddsSnapshot ?
        extractOdds1x2Teaser(prediction.oddsSnapshot.marketsJson)
      : null;
    const oddsDecimal =
      teaser ?
        {
          H: teaser.home != null ? 100 / teaser.home : null,
          D: teaser.draw != null ? 100 / teaser.draw : null,
          A: teaser.away != null ? 100 / teaser.away : null,
        }
      : { H: null, D: null, A: null };

    const flatRoi = flatRoi1x2({ pick, actual, odds: oddsDecimal });

    const actualOutcome = {
      outcome: actual,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    };
    const metricsJson = {
      hit1x2,
      brier1x2: Math.round(brier * 10000) / 10000,
      topPick: pick,
      flatRoi1x2: flatRoi,
      modelProbs: probs,
      hasOdds: teaser != null,
    };

    const grading = await this.prisma.matchPredictionGrading.upsert({
      where: { predictionId },
      create: {
        matchId: match.id,
        predictionId,
        actualOutcome: actualOutcome as Prisma.InputJsonValue,
        metricsJson: metricsJson as Prisma.InputJsonValue,
        oddsSnapshotId: prediction.oddsSnapshotId,
      },
      update: {
        gradedAt: new Date(),
        actualOutcome: actualOutcome as Prisma.InputJsonValue,
        metricsJson: metricsJson as Prisma.InputJsonValue,
        oddsSnapshotId: prediction.oddsSnapshotId,
      },
    });

    await this.appendValidationLog(match.id, {
      kind: 'PREDICTION_GRADING_V1',
      predictionId,
      version: prediction.version,
      hit1x2,
      brier1x2: metricsJson.brier1x2,
    });

    return { graded: true, predictionId, gradingId: grading.id, metricsJson };
  }

  async gradeFinishedBatch(opts: {
    maxMatches?: number;
    lookbackDays?: number;
  }) {
    const maxMatches = Math.min(500, Math.max(1, opts.maxMatches ?? 100));
    const lookbackDays = Math.min(365, Math.max(1, opts.lookbackDays ?? 60));
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'PREDICTION_GRADING_BATCH',
        status: 'RUNNING',
        params: opts as object,
      },
    });

    try {
      const rows = await this.prisma.matchPrediction.findMany({
        where: {
          lockedAt: { not: null },
          match: {
            status: MatchStatus.FINISHED,
            kickoffTime: { gte: since },
          },
          grading: null,
        },
        orderBy: { createdAt: 'desc' },
        take: maxMatches,
        select: { id: true },
      });

      let graded = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          const out = await this.gradePrediction(row.id);
          if (out.skipped) skipped += 1;
          else graded += 1;
        } catch (e) {
          if (errors.length < 30) {
            errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      const result = { attempted: rows.length, graded, skipped, errors };
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: msg, finishedAt: new Date() },
      });
      throw e;
    }
  }

  async gradingSummary(opts: { sample?: number; lookbackDays?: number }) {
    const sample = Math.min(500, Math.max(1, opts.sample ?? 100));
    const lookbackDays = Math.min(365, Math.max(1, opts.lookbackDays ?? 90));
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const rows = await this.prisma.matchPredictionGrading.findMany({
      where: { gradedAt: { gte: since } },
      orderBy: { gradedAt: 'desc' },
      take: sample,
      select: { metricsJson: true },
    });

    let hits = 0;
    let brierSum = 0;
    let roiSum = 0;
    let roiCount = 0;

    for (const row of rows) {
      const m = row.metricsJson as {
        hit1x2?: boolean;
        brier1x2?: number;
        flatRoi1x2?: number | null;
        hasOdds?: boolean;
      };
      if (m.hit1x2) hits += 1;
      if (typeof m.brier1x2 === 'number') brierSum += m.brier1x2;
      if (typeof m.flatRoi1x2 === 'number') {
        roiSum += m.flatRoi1x2;
        roiCount += 1;
      }
    }

    const n = rows.length;
    return {
      sample: n,
      lookbackDays,
      hitRate1x2: n ? Math.round((hits / n) * 1000) / 10 : null,
      avgBrier1x2: n ? Math.round((brierSum / n) * 10000) / 10000 : null,
      avgFlatRoi1x2: roiCount ? Math.round((roiSum / roiCount) * 1000) / 1000 : null,
      roiSampleSize: roiCount,
    };
  }

  private async appendValidationLog(matchId: string, entry: Record<string, unknown>) {
    try {
      const facts = await this.prisma.matchFacts.findUnique({ where: { matchId } });
      if (!facts) return;
      const log = Array.isArray(facts.validationLog) ? [...facts.validationLog] : [];
      log.push({ ...entry, at: new Date().toISOString() });
      await this.prisma.matchFacts.update({
        where: { matchId },
        data: { validationLog: log as Prisma.InputJsonValue },
      });
    } catch (e) {
      this.log.warn(`validationLog append failed: ${String(e)}`);
    }
  }
}
