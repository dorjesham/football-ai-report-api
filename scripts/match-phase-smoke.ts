/**
 * 抽样各状态场次打印 phase API 体积与 dataAvailability。
 * 用法: npm run match-phase:smoke
 * 固定场次: fixtures/ci-smoke-matches.json（null 时 findFirst）
 */
import * as fs from 'fs';
import * as path from 'path';
import { MatchStatus, PrismaClient } from '@prisma/client';
import type {
  MatchPhaseLiveFacts,
  MatchPhasePreFacts,
} from '../src/match-phase/match-phase.types';
import { failThreshold, isCiStrict } from './ci-strict.util';

const prisma = new PrismaClient();

type SmokeFixtures = {
  scheduledMatchId?: string | null;
  liveMatchId?: string | null;
  finishedMatchId?: string | null;
};

function loadFixtures(): SmokeFixtures {
  const p = path.join(process.cwd(), 'fixtures', 'ci-smoke-matches.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as SmokeFixtures;
  } catch {
    return {};
  }
}

async function resolveMatchId(
  status: MatchStatus,
  fixtures: SmokeFixtures,
): Promise<{ id: string } | null> {
  const fixed =
    status === MatchStatus.SCHEDULED
      ? fixtures.scheduledMatchId
      : status === MatchStatus.LIVE
        ? fixtures.liveMatchId
        : fixtures.finishedMatchId;
  if (fixed) {
    const row = await prisma.match.findUnique({
      where: { id: fixed },
      select: { id: true, status: true },
    });
    if (row?.status === status) return { id: row.id };
    if (isCiStrict()) {
      failThreshold(`fixture match ${fixed} not found or wrong status for ${status}`);
    }
  }
  const m = await prisma.match.findFirst({
    where: { status },
    orderBy: { kickoffTime: 'desc' },
    select: { id: true },
  });
  return m;
}

async function main() {
  const fixtures = loadFixtures();
  const statuses: MatchStatus[] = [
    MatchStatus.SCHEDULED,
    MatchStatus.LIVE,
    MatchStatus.FINISHED,
  ];
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const phase = app.get(
    (await import('../src/match-phase/match-phase.service')).MatchPhaseService,
  );

  let skippedCount = 0;
  let errorCount = 0;
  const results: unknown[] = [];

  for (const status of statuses) {
    const m = await resolveMatchId(status, fixtures);
    if (!m) {
      skippedCount += 1;
      const row = { status, skipped: true };
      results.push(row);
      console.log(JSON.stringify(row));
      continue;
    }
    try {
      if (status === MatchStatus.FINISHED) {
        const post = await phase.buildPostMatch(m.id, null);
        const row = {
          status,
          matchId: m.id,
          phase: post.phase,
          bytes: JSON.stringify(post).length,
          facts: post.facts,
        };
        results.push(row);
        console.log(JSON.stringify(row));
      } else if (status === MatchStatus.LIVE) {
        const live = await phase.buildLive(m.id, null);
        const row = {
          status,
          matchId: m.id,
          phase: live.phase,
          bytes: JSON.stringify(live).length,
          seq: (live.facts as MatchPhaseLiveFacts).live.meta.seq,
        };
        results.push(row);
        console.log(JSON.stringify(row));
      } else {
        const pre = await phase.buildPreMatch(m.id, null);
        const row = {
          status,
          matchId: m.id,
          phase: pre.phase,
          bytes: JSON.stringify(pre).length,
          dataAvailability: (pre.facts as MatchPhasePreFacts).dataAvailability,
        };
        results.push(row);
        console.log(JSON.stringify(row));
      }
    } catch (e) {
      errorCount += 1;
      const row = {
        status,
        matchId: m.id,
        error: e instanceof Error ? e.message : String(e),
      };
      results.push(row);
      console.log(JSON.stringify(row));
    }
  }
  await app.close();

  const summary = { skippedCount, errorCount, results };
  console.log(JSON.stringify({ smokeSummary: summary }));

  if (errorCount > 0) {
    failThreshold(`match-phase smoke errors: ${errorCount}`);
  }
  if (skippedCount === statuses.length) {
    failThreshold('all phase smoke statuses skipped (no matches in DB)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
