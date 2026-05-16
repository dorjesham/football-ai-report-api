/**
 * 抽样 FINISHED 场次生成赛后报告并提交校验（dry-run 可设 DRY_RUN=1 仅列候选）。
 */
import { MatchStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const max = parseInt(process.env.BATCH_MAX || '20', 10);
  const dry = process.env.DRY_RUN === '1';
  const since = new Date(Date.now() - 48 * 3600_000);

  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.FINISHED,
      kickoffTime: { gte: since },
      matchFacts: { isNot: null },
    },
    select: { id: true, homeScore: true, awayScore: true, kickoffTime: true },
    take: max,
    orderBy: { kickoffTime: 'desc' },
  });

  console.log(JSON.stringify({ dryRun: dry, candidates: matches.length, matches }, null, 2));
  if (dry) return;

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const postMatch = app.get(
    (await import('../src/ai-report/post-match-report.service')).PostMatchReportService,
  );
  const review = app.get(
    (await import('../src/ai-report/ai-report-review.service')).AiReportReviewService,
  );

  let ok = 0;
  let err = 0;
  for (const m of matches) {
    try {
      const report = await postMatch.generatePostMatch(m.id);
      const reviewed = await review.submitForReview(m.id, report.id);
      ok += reviewed.status === 'REVIEW' ? 1 : 0;
    } catch (e) {
      err++;
      console.error(m.id, e instanceof Error ? e.message : e);
    }
  }
  console.log(JSON.stringify({ generated: matches.length, reviewOk: ok, errors: err }, null, 2));
  await app.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
