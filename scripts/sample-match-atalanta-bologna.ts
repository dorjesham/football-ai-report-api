/**
 * 单场样板：Atalanta vs Bologna 0:1 — 跑通 A→E 并输出验收 JSON。
 * 用法：npx ts-node -r tsconfig-paths/register scripts/sample-match-atalanta-bologna.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const SAMPLE_MATCH_ID = process.env.SAMPLE_MATCH_ID || 'cmpbfdfpb03xgp201hvi8qew8';

type StepResult = {
  step: string;
  ok: boolean;
  durationMs: number;
  summary?: unknown;
  error?: string;
};

async function main() {
  const prisma = new PrismaClient();
  const results: {
    matchId: string;
    startedAt: string;
    steps: StepResult[];
    verification: Record<string, unknown>;
  } = {
    matchId: SAMPLE_MATCH_ID,
    startedAt: new Date().toISOString(),
    steps: [],
    verification: {},
  };

  const before = await prisma.match.findUnique({
    where: { id: SAMPLE_MATCH_ID },
    include: {
      homeTeam: { select: { nameCn: true, nameEn: true } },
      awayTeam: { select: { nameCn: true, nameEn: true } },
      competition: { select: { code: true } },
      activePrediction: true,
      matchFacts: true,
      aiReports: { select: { reportType: true, status: true } },
    },
  });
  if (!before) {
    console.error('Match not found:', SAMPLE_MATCH_ID);
    process.exit(1);
  }
  results.verification.before = {
    externalId: before.externalId,
    status: before.status,
    score: `${before.homeScore}-${before.awayScore}`,
    teams: `${before.homeTeam.nameCn} vs ${before.awayTeam.nameCn}`,
    code: before.competition?.code,
    hasFacts: !!before.matchFacts,
    hasPrediction: !!before.activePrediction,
    aiReports: before.aiReports,
  };

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const runStep = async (
    step: string,
    fn: () => Promise<unknown>,
  ): Promise<void> => {
    const t0 = Date.now();
    try {
      const summary = await fn();
      results.steps.push({
        step,
        ok: true,
        durationMs: Date.now() - t0,
        summary:
          summary && typeof summary === 'object' ?
            JSON.parse(JSON.stringify(summary))
          : summary,
      });
      console.log(`[OK] ${step} (${Date.now() - t0}ms)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.steps.push({
        step,
        ok: false,
        durationMs: Date.now() - t0,
        error: msg.slice(0, 2000),
      });
      console.error(`[FAIL] ${step}:`, msg);
    }
  };

  const afFacts = app.get(
    (await import('../src/api-football/match-af-facts-sync.service'))
      .MatchAfFactsSyncService,
  );
  const prediction = app.get(
    (await import('../src/prediction/prediction.service')).PredictionService,
  );
  const grading = app.get(
    (await import('../src/prediction/prediction-grading.service'))
      .PredictionGradingService,
  );
  const postMatch = app.get(
    (await import('../src/ai-report/post-match-report.service'))
      .PostMatchReportService,
  );
  const pipeline = app.get(
    (await import('../src/match-intel-pipeline/match-intel-pipeline.service'))
      .MatchIntelPipelineService,
  );
  const phase = app.get(
    (await import('../src/match-phase/match-phase.service')).MatchPhaseService,
  );
  const matches = app.get(
    (await import('../src/matches/matches.service')).MatchesService,
  );

  // A — MatchFacts
  await runStep('A_af_facts_sync', () =>
    afFacts.syncByMatchId(SAMPLE_MATCH_ID, { force: true }),
  );

  // B — Prediction (AF auto + fallback)
  await runStep('B_predictions_sync', () =>
    prediction.generateForMatch(SAMPLE_MATCH_ID, {
      provider: 'auto',
      forceRefresh: true,
    }),
  );

  // C — Grading
  await runStep('C_prediction_grading', async () => {
    const m = await prisma.match.findUnique({
      where: { id: SAMPLE_MATCH_ID },
      select: { activePredictionId: true },
    });
    if (!m?.activePredictionId) throw new Error('No activePrediction after step B');
    return grading.gradePrediction(m.activePredictionId);
  });

  // D — Post-match report
  await runStep('D_post_match_report', () =>
    postMatch.generatePostMatch(SAMPLE_MATCH_ID),
  );

  // E — Intel full (skip AI report draft to save time; still runs tactics/H2H/etc.)
  await runStep('E_intel_full', () =>
    pipeline.runFull(SAMPLE_MATCH_ID, {
      stopOnFailure: false,
      skipAiReport: true,
    }),
  );

  const postPayload = await phase.buildPostMatch(SAMPLE_MATCH_ID, null);
  const analysisPreview = await matches.getAnalysisPreview(SAMPLE_MATCH_ID, null);

  const after = await prisma.match.findUnique({
    where: { id: SAMPLE_MATCH_ID },
    include: {
      activePrediction: { include: { grading: true } },
      matchFacts: true,
      aiReports: { select: { reportType: true, status: true } },
      _count: {
        select: {
          tacticalScenarios: true,
          playerIntelligence: true,
        },
      },
    },
  });

  const postFacts = (
    postPayload.phase === 'post' ? postPayload.facts : null
  ) as { eventsCount?: number; dataAvailability?: unknown } | null;

  results.verification.after = {
    hasFacts: !!after?.matchFacts,
    eventsCount: postFacts?.eventsCount ?? null,
    dataAvailability: postFacts?.dataAvailability ?? null,
    narrativePresent: !!postPayload.narrative,
    predictionModelVersion: after?.activePrediction?.modelVersion ?? null,
    grading: !!after?.activePrediction?.grading,
    aiReports: after?.aiReports,
    tacticalCount: after?._count.tacticalScenarios,
    playerIntelCount: after?._count.playerIntelligence,
    analysisPreview: {
      tacticsCount: analysisPreview.tactics?.count,
      playerIntelCount: analysisPreview.playerIntelligence?.count,
      hasPrediction: !!analysisPreview.prediction,
    },
  };

  results.verification.postMatchSnippet = {
    phase: postPayload.phase,
    eventsCount: postFacts?.eventsCount,
    grading: postPayload.model?.grading != null,
    narrativeSummary: postPayload.narrative?.freeSummary?.slice(0, 200) ?? null,
  };

  await app.close();
  await prisma.$disconnect();

  const outPath = join(
    process.cwd(),
    'scripts',
    'sample-atalanta-bologna-result.json',
  );
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log('\nWrote', outPath);
  console.log(JSON.stringify(results, null, 2));

  const failed = results.steps.filter((s) => !s.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
