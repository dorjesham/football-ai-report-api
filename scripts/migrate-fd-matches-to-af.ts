/**
 * 将历史 Football-Data 场次匹配为 API-Football fixture，并更新 externalId=af-f-{id}。
 *
 * 用法（项目根目录）：
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-fd-matches-to-af.ts [--dry-run] [--limit=50]
 *
 * 需在 .env 配置 DATABASE_URL、API_FOOTBALL_API_KEY、REDIS_URL（配额计数）。
 */
import { PrismaClient, DataSourceType } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '50', 10) : 50;
  return { dryRun, limit: Math.min(500, Math.max(1, limit)) };
}

async function afGetFixtures(params: Record<string, string | number>) {
  const key = process.env.API_FOOTBALL_API_KEY?.trim();
  if (!key) throw new Error('API_FOOTBALL_API_KEY missing');
  const base =
    process.env.API_FOOTBALL_BASE_URL?.trim() || 'https://v3.football.api-sports.io';
  const res = await axios.get(`${base}/fixtures`, {
    headers: { 'x-apisports-key': key },
    params,
    timeout: 25_000,
  });
  return res.data as { response?: unknown[] };
}

function kickoffIso(d: Date): string {
  return d.toISOString().slice(0, 16);
}

async function main() {
  const { dryRun, limit } = parseArgs();
  const rows = await prisma.match.findMany({
    where: {
      OR: [
        { dataSource: DataSourceType.FOOTBALL_DATA },
        { externalId: { not: { startsWith: 'af-f-' } } },
      ],
      externalId: { not: null },
    },
    include: {
      homeTeam: { select: { nameEn: true, externalId: true } },
      awayTeam: { select: { nameEn: true, externalId: true } },
      competition: { select: { code: true, apiSportsLeagueId: true } },
    },
    take: limit,
    orderBy: { kickoffTime: 'desc' },
  });

  const failures: string[] = [];
  let ok = 0;

  for (const m of rows) {
    const leagueId = m.competition?.apiSportsLeagueId;
    if (!leagueId) {
      failures.push(`${m.id},no_league_id`);
      continue;
    }
    const season = m.kickoffTime.getFullYear();
    const date = m.kickoffTime.toISOString().slice(0, 10);
    try {
      const body = await afGetFixtures({ league: leagueId, season, date });
      const list = Array.isArray(body.response) ? body.response : [];
      const homeName = (m.homeTeam.nameEn || '').toLowerCase();
      const awayName = (m.awayTeam.nameEn || '').toLowerCase();
      let matched: { fixtureId: number } | null = null;
      for (const raw of list) {
        const item = raw as Record<string, unknown>;
        const teams = item.teams as Record<string, { name?: string }> | undefined;
        const h = (teams?.home?.name || '').toLowerCase();
        const a = (teams?.away?.name || '').toLowerCase();
        if (
          (h.includes(homeName.slice(0, 6)) || homeName.includes(h.slice(0, 6))) &&
          (a.includes(awayName.slice(0, 6)) || awayName.includes(a.slice(0, 6)))
        ) {
          const fid = Number((item.fixture as { id?: number })?.id);
          if (Number.isFinite(fid)) {
            matched = { fixtureId: fid };
            break;
          }
        }
      }
      if (!matched) {
        failures.push(`${m.id},no_fixture_match,${date},${homeName},${awayName}`);
        continue;
      }
      const newExt = `af-f-${matched.fixtureId}`;
      if (!dryRun) {
        await prisma.match.update({
          where: { id: m.id },
          data: {
            externalId: newExt,
            dataSource: DataSourceType.API_FOOTBALL,
          },
        });
      }
      ok += 1;
      console.log(`${dryRun ? '[dry] ' : ''}OK ${m.id} -> ${newExt} (${kickoffIso(m.kickoffTime)})`);
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      failures.push(`${m.id},error,${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nDone: ok=${ok} fail=${failures.length} scanned=${rows.length}`);
  if (failures.length) {
    console.log('Failures (CSV):');
    for (const line of failures) console.log(line);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
