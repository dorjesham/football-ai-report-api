/**
 * 近 N 场已发布 AiReport 重跑事实校验。
 * 用法: npm run report:fact-check-sample
 */
import { PrismaClient, ReportStatus } from '@prisma/client';
import { ReportFactCheckService } from '../src/ai-report/report-fact-check.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CI_THRESHOLDS, exitNoData, failThreshold } from './ci-strict.util';

const prisma = new PrismaClient();
const factCheck = new ReportFactCheckService(prisma as unknown as PrismaService);

async function main() {
  const limit = parseInt(process.env.SAMPLE_LIMIT || '50', 10);
  const reports = await prisma.aiReport.findMany({
    where: { status: ReportStatus.PUBLISHED },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });

  let pass = 0;
  let fail = 0;
  for (const r of reports) {
    const result = await factCheck.checkReport(r);
    if (result.pass) pass++;
    else fail++;
  }

  const passRate = reports.length ? pass / reports.length : null;
  const minPassRate = CI_THRESHOLDS.reportFactCheckMinPassRate();
  const summary = {
    sample: reports.length,
    pass,
    fail,
    passRate,
    minPassRate,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (reports.length === 0) {
    exitNoData('no PUBLISHED AiReport samples');
  }
  if (passRate != null && passRate < minPassRate) {
    failThreshold(
      `fact-check pass rate ${passRate} below min ${minPassRate}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
