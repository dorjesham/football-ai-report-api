/**
 * 对未来 N 天内 SCHEDULED 场次批量跑 intel 整场管线（限流、可 dry-run）。
 *
 *   DRY_RUN=1 npx ts-node scripts/batch-pipeline-upcoming.ts
 *   COMPETITION_IDS=seed-comp-pl,seed-comp-pd DAYS=14 LIMIT=20 npx ts-node scripts/batch-pipeline-upcoming.ts
 */
import { MatchStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.env.DRY_RUN === '1';
  const days = Math.min(60, Math.max(1, parseInt(process.env.DAYS || '14', 10)));
  const limit = Math.min(200, Math.max(1, parseInt(process.env.LIMIT || '30', 10)));
  const delayMs = Math.min(30_000, Math.max(0, parseInt(process.env.DELAY_MS || '3000', 10)));
  const compIds = (process.env.COMPETITION_IDS || 'seed-comp-pl,seed-comp-pd,seed-comp-sa,seed-comp-bl1,seed-comp-fl1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const until = new Date(Date.now() + days * 86400000);
  const matches = await prisma.match.findMany({
    where: {
      competitionId: { in: compIds },
      status: MatchStatus.SCHEDULED,
      kickoffTime: { gte: new Date(), lte: until },
    },
    select: { id: true, kickoffTime: true, competitionId: true },
    orderBy: { kickoffTime: 'asc' },
    take: limit,
  });

  console.log(
    JSON.stringify(
      { dryRun, days, limit, competitionIds: compIds, candidates: matches.length, matches },
      null,
      2,
    ),
  );
  if (dryRun || matches.length === 0) return;

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const pipeline = app.get(
    (await import('../src/match-intel-pipeline/match-intel-pipeline.service'))
      .MatchIntelPipelineService,
  );

  let ok = 0;
  let failed = 0;
  for (const m of matches) {
    try {
      const result = await pipeline.runFull(m.id);
      if (result.status === 'SUCCEEDED' || result.status === 'PARTIAL') ok += 1;
      else failed += 1;
      console.log(JSON.stringify({ matchId: m.id, status: result.status, summary: result.summary }));
    } catch (e) {
      failed += 1;
      console.error(m.id, e instanceof Error ? e.message : e);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  console.log(JSON.stringify({ processed: matches.length, ok, failed }, null, 2));
  await app.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
