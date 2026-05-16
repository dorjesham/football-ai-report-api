/**
 * 只读：按 Tournament 分类输出比赛与 MatchFacts 统计（与 GET /admin/match-data-report 同源逻辑）。
 *
 *   npm run stats:match-report
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/db-match-stats-report.ts
 *
 * 需要 DATABASE_URL（.env 中带引号时会自动剥离）。
 */
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { computeMatchDataOverview } from '../src/stats/match-data-overview';

dotenvConfig({ path: path.join(__dirname, '..', '.env') });

function stripEnvQuotes(v: string | undefined): string | undefined {
  if (v == null || v === '') return v;
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

async function main() {
  const dbUrl = stripEnvQuotes(process.env.DATABASE_URL);
  if (dbUrl) process.env.DATABASE_URL = dbUrl;

  const prisma = new PrismaClient();
  try {
    const overview = await computeMatchDataOverview(prisma);
    console.log(JSON.stringify(overview, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
