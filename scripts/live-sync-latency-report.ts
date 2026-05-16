/**
 * 统计近 24h live-sync ApiLog 延迟（durationMs 在 message 字段）。
 * 用法: npm run live-sync:latency-report
 */
import { PrismaClient } from '@prisma/client';
import { CI_THRESHOLDS, exitNoData, failThreshold } from './ci-strict.util';

const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await prisma.apiLog.findMany({
    where: {
      provider: 'live-sync',
      createdAt: { gte: since },
    },
    select: { message: true, success: true },
    take: 5000,
  });

  const durations: number[] = [];
  for (const r of rows) {
    const m = /durationMs=(\d+)/.exec(r.message ?? '');
    if (m) durations.push(Number(m[1]));
  }
  durations.sort((a, b) => a - b);
  const n = durations.length;
  const pct = (p: number) =>
    n ? durations[Math.min(n - 1, Math.floor((n * p) / 100))] : null;

  const p95Ms = pct(95);
  const summary = {
    sample: n,
    successRate: n ? rows.filter((r) => r.success).length / rows.length : null,
    p50Ms: pct(50),
    p95Ms,
    maxMs: n ? durations[n - 1] : null,
    thresholdP95MaxMs: CI_THRESHOLDS.liveSyncP95MaxMs(),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (n === 0) {
    exitNoData('no live-sync ApiLog samples in last 24h');
  }
  if (p95Ms != null && p95Ms > summary.thresholdP95MaxMs) {
    failThreshold(
      `live-sync P95 ${p95Ms}ms exceeds max ${summary.thresholdP95MaxMs}ms`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
