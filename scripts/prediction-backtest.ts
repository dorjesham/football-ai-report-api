/**
 * 近 N 场 FINISHED、且 active 预测已冻结（lockedAt）的对账验收。
 * 对每场调用 PredictionGradingService.gradePrediction（幂等写 MatchPredictionGrading）。
 *
 * 用法: npm run prediction:backtest
 * 环境: PREDICTION_BACKTEST_LOOKBACK_DAYS、PREDICTION_BACKTEST_SAMPLE（默认 90 / 100）
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MatchStatus } from '@prisma/client';
import configuration from '../src/config/configuration';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PredictionGradingService } from '../src/prediction/prediction-grading.service';
import { PredictionModule } from '../src/prediction/prediction.module';
import {
  brierScore1x2,
  resolveActualOutcome1x2,
  top1x2Pick,
} from '../src/prediction/prediction-grading.util';
import { CI_THRESHOLDS, exitNoData } from './ci-strict.util';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    PredictionModule,
  ],
})
class PredictionBacktestCliModule {}

async function main() {
  const lookbackDays = parseInt(process.env.PREDICTION_BACKTEST_LOOKBACK_DAYS || '90', 10);
  const sample = parseInt(process.env.PREDICTION_BACKTEST_SAMPLE || '100', 10);
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const app = await NestFactory.createApplicationContext(PredictionBacktestCliModule, {
    logger: false,
  });
  const grading = app.get(PredictionGradingService);
  const prisma = app.get(PrismaService);

  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.FINISHED,
      kickoffTime: { gte: since },
      activePredictionId: { not: null },
      activePrediction: {
        is: { lockedAt: { not: null } },
      },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { id: true, activePredictionId: true },
    orderBy: { kickoffTime: 'desc' },
    take: sample,
  });

  const logicErrors: string[] = [];
  let graded = 0;
  let skipped = 0;
  let hits = 0;
  let brierSum = 0;
  let roiSum = 0;
  let roiN = 0;

  for (const m of matches) {
    const pid = m.activePredictionId!;
    try {
      const predRow = await prisma.matchPrediction.findUnique({
        where: { id: pid },
        include: { match: true },
      });
      if (!predRow) {
        logicErrors.push(`${m.id}: missing active prediction ${pid}`);
        continue;
      }
      const hs = predRow.match.homeScore!;
      const as = predRow.match.awayScore!;
      const probs = {
        H: predRow.homeWinProbability,
        D: predRow.drawProbability,
        A: predRow.awayWinProbability,
      };
      const sum = probs.H + probs.D + probs.A;
      if (sum !== 100) {
        logicErrors.push(`${pid}: prob sum ${sum} != 100`);
      }
      if (probs.H < 0 || probs.D < 0 || probs.A < 0) {
        logicErrors.push(`${pid}: negative prob`);
      }

      const out = await grading.gradePrediction(pid);
      if ('skipped' in out && out.skipped) {
        skipped += 1;
        continue;
      }
      graded += 1;
      const actual = resolveActualOutcome1x2(hs, as);
      const pick = top1x2Pick(probs);
      if (pick === actual) hits += 1;
      brierSum += brierScore1x2(probs, actual);

      const mj = out.metricsJson as { flatRoi1x2?: number | null; hasOdds?: boolean };
      if (typeof mj.flatRoi1x2 === 'number') {
        roiSum += mj.flatRoi1x2;
        roiN += 1;
      }
    } catch (e) {
      logicErrors.push(`${pid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await app.close();

  const n = matches.length;
  const minGraded = CI_THRESHOLDS.predictionBacktestMinGraded();
  const summary = {
    candidates: n,
    lookbackDays,
    graded,
    skipped,
    hitRate1x2: graded ? Math.round((hits / graded) * 1000) / 10 : null,
    avgBrier1x2: graded ? Math.round((brierSum / graded) * 10000) / 10000 : null,
    avgFlatRoiOddsSample: roiN ? Math.round((roiSum / roiN) * 1000) / 1000 : null,
    roiSampleSize: roiN,
    logicErrors,
    minGraded,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (logicErrors.length > 0) {
    console.error(`[CI] prediction backtest logic errors: ${logicErrors.length}`);
    process.exit(1);
  }
  if (graded < minGraded) {
    exitNoData(
      `graded ${graded} < minGraded ${minGraded} (candidates=${n})`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
